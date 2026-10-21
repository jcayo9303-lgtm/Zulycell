import { Router } from "express";
import { z } from "zod";
import type { PaymentMethod } from "@prisma/client";
import { prisma, type Prisma } from "../lib/prisma.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { dateStr, listQuery, money, optStr, reqStr } from "../lib/validate.js";
import { dayRangeUtc } from "../lib/dates.js";
import { round2 } from "../lib/money.js";
import { sendXlsx } from "../lib/xlsx.js";
import { ctx, requirePerm } from "../middleware/auth.js";
import { excelDate, methodLabel, resolveDays } from "./reporting.js";

const router = Router();

const canRead = requirePerm("cash_manage", "balance_view");
const canManage = requirePerm("cash_manage");

type ByMethod = { method: PaymentMethod | null; total: number; count: number }[];
type Group = { byMethod: ByMethod; total: number };

export type CashSummary = {
  from: string;
  to: string;
  openingAmount: number;
  sales: Group & { count: number };
  repairs: Group;
  clientPayments: Group;
  expenses: Group;
  purchases: Group;
  supplierPayments: Group;
  movements: { in: number; out: number };
  cashIn: number;
  cashOut: number;
  expectedCash: number;
};

const group = (rows: { method: PaymentMethod | null; _sum: { amount?: Prisma.Decimal | null; total?: Prisma.Decimal | null }; _count: number }[]): Group => {
  const byMethod = rows
    .map((r) => ({ method: r.method, total: round2((r._sum.amount ?? r._sum.total)?.toNumber() ?? 0), count: r._count }))
    .sort((a, b) => b.total - a.total);
  return { byMethod, total: round2(byMethod.reduce((acc, m) => acc + m.total, 0)) };
};
const cashOf = (g: Group) => g.byMethod.find((m) => m.method === "CASH")?.total ?? 0;

/**
 * Resumen de una sesión de caja: todo lo registrado entre la apertura y `until`.
 * Efectivo esperado = apertura + entradas en efectivo − salidas en efectivo.
 */
async function computeSummary(session: { id: string; businessId: string; openedAt: Date; openingAmount: Prisma.Decimal }, until: Date): Promise<CashSummary> {
  const bid = session.businessId;
  const window = { gte: session.openedAt, lte: until };

  const [sales, repairs, clientPayments, expenses, purchases, supplierPayments, movements] = await Promise.all([
    prisma.sale.groupBy({
      by: ["method"],
      where: { businessId: bid, status: "COMPLETED", createdAt: window },
      _sum: { total: true },
      _count: true,
    }),
    prisma.repairPayment.groupBy({ by: ["method"], where: { businessId: bid, createdAt: window }, _sum: { amount: true }, _count: true }),
    prisma.clientMovement.groupBy({
      by: ["method"],
      where: {
        businessId: bid,
        type: "PAYMENT",
        method: { not: null },
        createdAt: window,
        OR: [{ description: null }, { NOT: { description: { startsWith: "Anulación" } } }],
      },
      _sum: { amount: true },
      _count: true,
    }),
    // Los gastos cuentan cuando se registran (la fecha del gasto puede ser anterior)
    prisma.expense.groupBy({ by: ["method"], where: { businessId: bid, deletedAt: null, createdAt: window }, _sum: { amount: true }, _count: true }),
    prisma.purchase.groupBy({ by: ["method"], where: { businessId: bid, createdAt: window }, _sum: { total: true }, _count: true }),
    prisma.supplierMovement.groupBy({ by: ["method"], where: { businessId: bid, type: "PAYMENT", createdAt: window }, _sum: { amount: true }, _count: true }),
    prisma.cashMovement.groupBy({ by: ["type"], where: { sessionId: session.id }, _sum: { amount: true } }),
  ]);

  const salesGroup = group(sales);
  const s = {
    sales: { ...salesGroup, count: sales.reduce((acc, r) => acc + r._count, 0) },
    repairs: group(repairs),
    clientPayments: group(clientPayments),
    expenses: group(expenses),
    // Las compras a crédito no mueven caja; se muestran igual para referencia
    purchases: group(purchases),
    supplierPayments: group(supplierPayments),
  };
  const mIn = movements.find((m) => m.type === "IN")?._sum.amount?.toNumber() ?? 0;
  const mOut = movements.find((m) => m.type === "OUT")?._sum.amount?.toNumber() ?? 0;
  const opening = session.openingAmount.toNumber();
  const cashIn = round2(cashOf(s.sales) + cashOf(s.repairs) + cashOf(s.clientPayments) + mIn);
  const cashOut = round2(cashOf(s.expenses) + cashOf(s.purchases) + cashOf(s.supplierPayments) + mOut);

  return {
    from: session.openedAt.toISOString(),
    to: until.toISOString(),
    openingAmount: opening,
    ...s,
    movements: { in: round2(mIn), out: round2(mOut) },
    cashIn,
    cashOut,
    expectedCash: round2(opening + cashIn - cashOut),
  };
}

async function userNames(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!unique.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

async function sessionDetail(businessId: string, id: string) {
  const session = await prisma.cashSession.findFirst({
    where: { id, businessId },
    include: { movements: { orderBy: { createdAt: "desc" } } },
  });
  if (!session) throw notFound("La sesión de caja no existe.");
  const names = await userNames([session.openedBy, session.closedBy, ...session.movements.map((m) => m.userId)]);
  const summary =
    session.status === "CLOSED" && session.summary
      ? (session.summary as unknown as CashSummary)
      : await computeSummary(session, new Date());
  return {
    ...session,
    openedByName: names.get(session.openedBy) ?? null,
    closedByName: session.closedBy ? names.get(session.closedBy) ?? null : null,
    movements: session.movements.map((m) => ({ ...m, userName: m.userId ? names.get(m.userId) ?? null : null })),
    summary,
  };
}

router.get("/current", canRead, async (req, res) => {
  const a = ctx(req);
  const open = await prisma.cashSession.findFirst({ where: { businessId: a.businessId, status: "OPEN" }, orderBy: { openedAt: "desc" } });
  res.json({ session: open ? await sessionDetail(a.businessId, open.id) : null });
});

router.post("/open", canManage, async (req, res) => {
  const a = ctx(req);
  const data = z.object({ openingAmount: money(0), notes: optStr(500) }).parse(req.body);
  const session = await prisma.$transaction(async (tx) => {
    // Bloquea la fila del negocio para que dos aperturas simultáneas no creen dos cajas
    await tx.$executeRaw`SELECT id FROM "Business" WHERE id = ${a.businessId} FOR UPDATE`;
    const existing = await tx.cashSession.findFirst({ where: { businessId: a.businessId, status: "OPEN" } });
    if (existing) throw conflict("Ya hay una caja abierta. Ciérrala antes de abrir otra.");
    return tx.cashSession.create({
      data: { businessId: a.businessId, openedBy: a.userId, openingAmount: data.openingAmount, notes: data.notes ?? null },
    });
  });
  res.status(201).json(await sessionDetail(a.businessId, session.id));
});

router.post("/movements", canManage, async (req, res) => {
  const a = ctx(req);
  const data = z.object({ type: z.enum(["IN", "OUT"]), amount: money(0.01), reason: reqStr(255) }).parse(req.body);
  const open = await prisma.cashSession.findFirst({ where: { businessId: a.businessId, status: "OPEN" } });
  if (!open) throw badRequest("No hay una caja abierta.");
  const movement = await prisma.cashMovement.create({
    data: { businessId: a.businessId, sessionId: open.id, type: data.type, amount: data.amount, reason: data.reason, userId: a.userId },
  });
  res.status(201).json(movement);
});

router.post("/close", canManage, async (req, res) => {
  const a = ctx(req);
  const data = z.object({ countedCash: money(0), notes: optStr(500) }).parse(req.body);
  const open = await prisma.cashSession.findFirst({ where: { businessId: a.businessId, status: "OPEN" } });
  if (!open) throw badRequest("No hay una caja abierta.");

  const closedAt = new Date();
  const summary = await computeSummary(open, closedAt);
  const notes = [open.notes, data.notes].filter(Boolean).join(" · ") || null;
  const updated = await prisma.cashSession.updateMany({
    where: { id: open.id, status: "OPEN" },
    data: {
      status: "CLOSED",
      closedBy: a.userId,
      closedAt,
      expectedCash: summary.expectedCash,
      countedCash: data.countedCash,
      difference: round2(data.countedCash - summary.expectedCash),
      summary: summary as unknown as Prisma.InputJsonValue,
      notes: notes?.slice(0, 500) ?? null,
    },
  });
  if (!updated.count) throw conflict("La caja ya fue cerrada.");
  res.json(await sessionDetail(a.businessId, open.id));
});

const historySchema = listQuery.extend({
  from: dateStr.optional(),
  to: dateStr.optional(),
  period: z.enum(["today", "week", "month", "year"]).optional(),
});

router.get("/sessions", canRead, async (req, res) => {
  const a = ctx(req);
  const f = historySchema.parse(req.query);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: a.businessId }, select: { timezone: true } });
  const where: Prisma.CashSessionWhereInput = { businessId: a.businessId };
  if (f.period || f.from || f.to) {
    const { from, to } = resolveDays(business.timezone, f);
    where.openedAt = dayRangeUtc(business.timezone, from, to);
  }
  const [rows, total] = await Promise.all([
    prisma.cashSession.findMany({
      where,
      orderBy: { openedAt: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      select: {
        id: true,
        status: true,
        openedAt: true,
        closedAt: true,
        openedBy: true,
        closedBy: true,
        openingAmount: true,
        expectedCash: true,
        countedCash: true,
        difference: true,
        summary: true,
        notes: true,
      },
    }),
    prisma.cashSession.count({ where }),
  ]);
  const names = await userNames(rows.flatMap((r) => [r.openedBy, r.closedBy]));
  res.json({
    items: rows.map(({ summary, ...r }) => {
      const s = summary as unknown as CashSummary | null;
      return {
        ...r,
        openedByName: names.get(r.openedBy) ?? null,
        closedByName: r.closedBy ? names.get(r.closedBy) ?? null : null,
        salesTotal: s?.sales.total ?? null,
        repairsTotal: s?.repairs.total ?? null,
      };
    }),
    total,
    page: f.page,
    pageSize: f.pageSize,
  });
});

router.get("/sessions/:id", canRead, async (req, res) => {
  res.json(await sessionDetail(ctx(req).businessId, String(req.params.id)));
});

router.get("/sessions/:id/export.xlsx", canRead, async (req, res) => {
  const a = ctx(req);
  const s = await sessionDetail(a.businessId, String(req.params.id));
  const business = await prisma.business.findUniqueOrThrow({ where: { id: a.businessId }, select: { timezone: true } });
  const tz = business.timezone;
  const sum = s.summary;

  const concept = (label: string, amount: number | null | undefined) => ({ concept: label, amount: amount ?? null });
  const byMethodRows = (label: string, g: Group) => g.byMethod.map((m) => ({ concept: label, method: methodLabel(m.method), count: m.count, total: m.total }));

  await sendXlsx(res, `cierre_caja_${excelDate(tz, s.openedAt)?.toISOString().slice(0, 10) ?? s.id}`, [
    {
      name: "Resumen",
      columns: [
        { header: "Concepto", key: "concept", width: 34 },
        { header: "Monto", key: "amount", width: 16, format: "money" },
      ],
      rows: [
        concept("Apertura", sum.openingAmount),
        concept("Ventas (todas)", sum.sales.total),
        concept("Reparaciones", sum.repairs.total),
        concept("Abonos de clientes", sum.clientPayments.total),
        concept("Gastos", sum.expenses.total),
        concept("Compras", sum.purchases.total),
        concept("Pagos a proveedores", sum.supplierPayments.total),
        concept("Ingresos manuales de efectivo", sum.movements.in),
        concept("Retiros manuales de efectivo", sum.movements.out),
        concept("Entradas en efectivo", sum.cashIn),
        concept("Salidas en efectivo", sum.cashOut),
        concept("Efectivo esperado", sum.expectedCash),
        concept("Efectivo contado", s.countedCash?.toNumber()),
        concept("Diferencia (sobrante + / faltante −)", s.difference?.toNumber()),
      ],
    },
    {
      name: "Por método de pago",
      columns: [
        { header: "Concepto", key: "concept", width: 22 },
        { header: "Método", key: "method", width: 18 },
        { header: "Cantidad", key: "count", format: "int" },
        { header: "Total", key: "total", width: 16, format: "money" },
      ],
      rows: [
        ...byMethodRows("Ventas", sum.sales),
        ...byMethodRows("Reparaciones", sum.repairs),
        ...byMethodRows("Abonos de clientes", sum.clientPayments),
        ...byMethodRows("Gastos", sum.expenses),
        ...byMethodRows("Compras", sum.purchases),
        ...byMethodRows("Pagos a proveedores", sum.supplierPayments),
      ],
    },
    {
      name: "Movimientos de efectivo",
      columns: [
        { header: "Fecha", key: "date", width: 18, format: "datetime" },
        { header: "Tipo", key: "type", width: 10 },
        { header: "Motivo", key: "reason", width: 40 },
        { header: "Usuario", key: "user", width: 20 },
        { header: "Monto", key: "amount", width: 14, format: "money" },
      ],
      rows: s.movements.map((m) => ({
        date: excelDate(tz, m.createdAt),
        type: m.type === "IN" ? "Ingreso" : "Retiro",
        reason: m.reason,
        user: m.userName ?? "",
        amount: m.amount.toNumber(),
      })),
    },
  ]);
});

export default router;

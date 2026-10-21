import { Router, type Request } from "express";
import { z } from "zod";
import { prisma, type Prisma } from "../lib/prisma.js";
import { badRequest } from "../lib/errors.js";
import { dateStr, paymentMethod } from "../lib/validate.js";
import { addDays, dayRangeUtc, quickRange, todayYmd } from "../lib/dates.js";
import { sendXlsx } from "../lib/xlsx.js";
import { EXPENSE_LABEL, excelDate, localDay, methodLabel, resolveDays } from "./reporting.js";
import { round2 } from "../lib/money.js";
import { ctx, requirePerm } from "../middleware/auth.js";

const router = Router();

const filterSchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  period: z.enum(["today", "week", "month", "year"]).optional(),
  userId: z.string().max(40).optional(),
  method: paymentMethod.optional(),
  categoryId: z.string().max(40).optional(),
  productId: z.string().max(40).optional(),
});

/** Traduce los filtros (docs §19) a condiciones de Prisma en la zona horaria del negocio. */
async function resolveFilters(req: Request) {
  const a = ctx(req);
  const f = filterSchema.parse(req.query);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: a.businessId }, select: { timezone: true } });
  const tz = business.timezone;

  let { from, to } = f.period ? quickRange(tz, f.period) : { from: f.from, to: f.to };
  if (!from || !to) {
    const month = quickRange(tz, "month");
    from ??= month.from;
    to ??= todayYmd(tz);
  }
  if (from > to) throw badRequest("La fecha inicial no puede ser mayor que la final.");
  const range = dayRangeUtc(tz, from, to);

  let productIds: string[] | null = null;
  if (f.productId) productIds = [f.productId];
  else if (f.categoryId) {
    const products = await prisma.product.findMany({
      where: { businessId: a.businessId, categoryId: f.categoryId },
      select: { id: true },
    });
    productIds = products.map((p) => p.id);
  }

  const saleWhere: Prisma.SaleWhereInput = { businessId: a.businessId, status: "COMPLETED", createdAt: range };
  if (f.userId) saleWhere.userId = f.userId;
  if (f.method) saleWhere.method = f.method;
  if (productIds) saleWhere.items = { some: { productId: { in: productIds } } };

  return { a, f, tz, from, to, range, saleWhere, productIds };
}

router.get("/", requirePerm("stats_view"), async (req, res) => {
  const { a, f, tz, from, to, range, saleWhere, productIds } = await resolveFilters(req);
  const itemWhere: Prisma.SaleItemWhereInput = { sale: saleWhere, ...(productIds ? { productId: { in: productIds } } : {}) };

  const repairWhere: Prisma.RepairPaymentWhereInput = {
    businessId: a.businessId,
    createdAt: range,
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.method ? { method: f.method } : {}),
  };
  const [sales, expenses, items, top, byMethod, repairs] = await Promise.all([
    prisma.sale.findMany({ where: saleWhere, select: { createdAt: true, total: true } }),
    prisma.expense.findMany({
      where: { businessId: a.businessId, deletedAt: null, date: range },
      select: { date: true, amount: true },
    }),
    prisma.saleItem.findMany({ where: { sale: saleWhere }, select: { quantity: true, unitCost: true } }),
    prisma.saleItem.groupBy({
      by: ["productId", "name"],
      where: itemWhere,
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: "desc" } },
      take: 10,
    }),
    prisma.sale.groupBy({ by: ["method"], where: saleWhere, _sum: { total: true }, _count: true }),
    // Con filtro de producto/categoría no aplica: las reparaciones no son ventas de productos
    productIds ? Promise.resolve([]) : prisma.repairPayment.findMany({ where: repairWhere, select: { createdAt: true, amount: true } }),
  ]);

  // Serie diaria; si el rango supera ~2 meses se agrupa por mes
  const days = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  const monthly = days > 62;
  const keyOf = (d: Date) => (monthly ? localDay(tz, d).slice(0, 7) : localDay(tz, d));
  const buckets = new Map<string, { date: string; sales: number; repairs: number; expenses: number }>();
  for (let i = 0; i < days; i++) {
    const k = monthly ? addDays(from, i).slice(0, 7) : addDays(from, i);
    if (!buckets.has(k)) buckets.set(k, { date: k, sales: 0, repairs: 0, expenses: 0 });
  }
  for (const s of sales) {
    const b = buckets.get(keyOf(s.createdAt));
    if (b) b.sales = round2(b.sales + s.total.toNumber());
  }
  for (const r of repairs) {
    const b = buckets.get(keyOf(r.createdAt));
    if (b) b.repairs = round2(b.repairs + r.amount.toNumber());
  }
  for (const e of expenses) {
    const b = buckets.get(keyOf(e.date));
    if (b) b.expenses = round2(b.expenses + e.amount.toNumber());
  }

  const totalSales = round2(sales.reduce((acc, s) => acc + s.total.toNumber(), 0));
  const expensesTotal = round2(expenses.reduce((acc, e) => acc + e.amount.toNumber(), 0));
  const cost = items.reduce((acc, i) => acc + i.quantity.toNumber() * i.unitCost.toNumber(), 0);

  res.json({
    from,
    to,
    granularity: monthly ? "month" : "day",
    totalSales,
    transactions: sales.length,
    avgTicket: sales.length ? round2(totalSales / sales.length) : 0,
    expensesTotal,
    repairIncome: round2(repairs.reduce((acc, r) => acc + r.amount.toNumber(), 0)),
    profitEstimate: round2(totalSales - cost),
    series: [...buckets.values()],
    topProducts: top.map((t) => ({
      productId: t.productId,
      name: t.name,
      quantity: t._sum.quantity?.toNumber() ?? 0,
      total: t._sum.subtotal?.toNumber() ?? 0,
    })),
    byMethod: byMethod.map((m) => ({ method: m.method, total: m._sum.total?.toNumber() ?? 0, count: m._count })),
  });
});

router.get("/export.xlsx", requirePerm("stats_view"), async (req, res) => {
  const { a, tz, from, to, range, saleWhere, productIds } = await resolveFilters(req);
  // Incluye también las anuladas para cuadrar con la numeración
  const { status: _status, ...where } = saleWhere;
  const itemWhere: Prisma.SaleItemWhereInput = { sale: saleWhere, ...(productIds ? { productId: { in: productIds } } : {}) };
  const [sales, top, expenses] = await Promise.all([
    prisma.sale.findMany({ where, orderBy: { createdAt: "asc" }, take: 20_000, include: { client: { select: { name: true } } } }),
    prisma.saleItem.groupBy({
      by: ["productId", "name"],
      where: itemWhere,
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: "desc" } },
      take: 100,
    }),
    prisma.expense.findMany({ where: { businessId: a.businessId, deletedAt: null, date: range }, orderBy: { date: "asc" } }),
  ]);

  await sendXlsx(res, `estadisticas_${from}_${to}`, [
    {
      name: "Ventas",
      columns: [
        { header: "Fecha", key: "date", width: 18, format: "datetime" },
        { header: "Número", key: "number", width: 10, format: "int" },
        { header: "Cliente", key: "client", width: 28 },
        { header: "Método de pago", key: "method", width: 16 },
        { header: "Subtotal", key: "subtotal", format: "money" },
        { header: "Descuento", key: "discount", format: "money" },
        { header: "Total", key: "total", format: "money" },
        { header: "Estado", key: "status", width: 12 },
      ],
      rows: sales.map((s) => ({
        date: excelDate(tz, s.createdAt),
        number: s.number,
        client: s.client?.name ?? "",
        method: methodLabel(s.method),
        subtotal: s.subtotal.toNumber(),
        discount: s.discountTotal.toNumber(),
        total: s.status === "COMPLETED" ? s.total.toNumber() : 0,
        status: s.status === "COMPLETED" ? "Completada" : "Anulada",
      })),
      totals: ["subtotal", "discount", "total"],
    },
    {
      name: "Productos más vendidos",
      columns: [
        { header: "Producto", key: "name", width: 40 },
        { header: "Cantidad", key: "quantity", format: "qty" },
        { header: "Total vendido", key: "total", width: 15, format: "money" },
      ],
      rows: top.map((t) => ({ name: t.name, quantity: t._sum.quantity?.toNumber() ?? 0, total: t._sum.subtotal?.toNumber() ?? 0 })),
      totals: ["quantity", "total"],
    },
    {
      name: "Gastos",
      columns: [
        { header: "Fecha", key: "date", width: 18, format: "datetime" },
        { header: "Categoría", key: "category", width: 20 },
        { header: "Concepto", key: "description", width: 36 },
        { header: "Método", key: "method", width: 16 },
        { header: "Monto", key: "amount", format: "money" },
      ],
      rows: expenses.map((e) => ({
        date: excelDate(tz, e.date),
        category: EXPENSE_LABEL[e.category] ?? e.category,
        description: e.description ?? "",
        method: methodLabel(e.method),
        amount: e.amount.toNumber(),
      })),
      totals: ["amount"],
    },
  ]);
});

// ─── Ingresos y egresos (base caja: lo efectivamente cobrado y pagado) ────────

const incomeSchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  period: z.enum(["today", "week", "month", "year"]).optional(),
  group: z.enum(["day", "month"]).default("day"),
});

const INCOME_KEYS = ["sales", "repairs", "clientPayments", "income", "expenses", "purchases", "supplierPayments", "outflow", "net"] as const;
type IncomeRow = { key: string } & Record<(typeof INCOME_KEYS)[number], number>;

/**
 * Ventas al contado (las de crédito entran cuando el cliente abona), pagos de reparaciones y abonos,
 * frente a gastos y compras al contado y pagos a proveedores.
 */
async function computeIncome(req: Request) {
  const a = ctx(req);
  const f = incomeSchema.parse(req.query);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: a.businessId }, select: { timezone: true } });
  const tz = business.timezone;
  const { from, to } = resolveDays(tz, f);
  const range = dayRangeUtc(tz, from, to);
  const bid = a.businessId;

  const [sales, repairs, clientPayments, expenses, purchases, supplierPayments] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId: bid, status: "COMPLETED", method: { not: "CREDIT" }, createdAt: range },
      select: { createdAt: true, total: true },
    }),
    prisma.repairPayment.findMany({ where: { businessId: bid, createdAt: range }, select: { createdAt: true, amount: true } }),
    // Las anulaciones de ventas a crédito generan un PAYMENT sin método: no es dinero cobrado
    prisma.clientMovement.findMany({
      where: {
        businessId: bid,
        type: "PAYMENT",
        method: { not: null },
        createdAt: range,
        OR: [{ description: null }, { NOT: { description: { startsWith: "Anulación" } } }],
      },
      select: { createdAt: true, amount: true },
    }),
    prisma.expense.findMany({
      where: { businessId: bid, deletedAt: null, date: range, OR: [{ method: null }, { method: { not: "CREDIT" } }] },
      select: { date: true, amount: true },
    }),
    prisma.purchase.findMany({
      where: {
        businessId: bid,
        method: { not: "CREDIT" },
        date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
      },
      select: { date: true, total: true },
    }),
    prisma.supplierMovement.findMany({ where: { businessId: bid, type: "PAYMENT", createdAt: range }, select: { createdAt: true, amount: true } }),
  ]);

  const keyOfDay = (ymd: string) => (f.group === "month" ? ymd.slice(0, 7) : ymd);
  const rows = new Map<string, IncomeRow>();
  const days = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  for (let i = 0; i < days; i++) {
    const k = keyOfDay(addDays(from, i));
    if (!rows.has(k)) {
      rows.set(k, { key: k, sales: 0, repairs: 0, clientPayments: 0, income: 0, expenses: 0, purchases: 0, supplierPayments: 0, outflow: 0, net: 0 });
    }
  }
  const add = (ymd: string, field: (typeof INCOME_KEYS)[number], amount: number) => {
    const r = rows.get(keyOfDay(ymd));
    if (r) r[field] = round2(r[field] + amount);
  };
  for (const s of sales) add(localDay(tz, s.createdAt), "sales", s.total.toNumber());
  for (const r of repairs) add(localDay(tz, r.createdAt), "repairs", r.amount.toNumber());
  for (const c of clientPayments) add(localDay(tz, c.createdAt), "clientPayments", c.amount.toNumber());
  for (const e of expenses) add(localDay(tz, e.date), "expenses", e.amount.toNumber());
  // Purchase.date es DATE (sin hora): ya es el día local
  for (const p of purchases) add(p.date.toISOString().slice(0, 10), "purchases", p.total.toNumber());
  for (const s of supplierPayments) add(localDay(tz, s.createdAt), "supplierPayments", s.amount.toNumber());

  const list = [...rows.values()].map((r) => {
    const income = round2(r.sales + r.repairs + r.clientPayments);
    const outflow = round2(r.expenses + r.purchases + r.supplierPayments);
    return { ...r, income, outflow, net: round2(income - outflow) };
  });
  const totals = Object.fromEntries(INCOME_KEYS.map((k) => [k, round2(list.reduce((acc, r) => acc + r[k], 0))]));
  return { from, to, group: f.group, rows: list, totals };
}

router.get("/income", requirePerm("stats_view", "balance_view"), async (req, res) => {
  res.json(await computeIncome(req));
});

router.get("/income.xlsx", requirePerm("stats_view", "balance_view"), async (req, res) => {
  const data = await computeIncome(req);
  await sendXlsx(res, `ingresos_${data.from}_${data.to}`, [
    {
      name: "Ingresos y egresos",
      columns: [
        { header: data.group === "month" ? "Mes" : "Día", key: "key", width: 12 },
        { header: "Ventas al contado", key: "sales", width: 17, format: "money" },
        { header: "Reparaciones", key: "repairs", width: 15, format: "money" },
        { header: "Abonos de clientes", key: "clientPayments", width: 18, format: "money" },
        { header: "Total ingresos", key: "income", width: 15, format: "money" },
        { header: "Gastos", key: "expenses", width: 14, format: "money" },
        { header: "Compras al contado", key: "purchases", width: 18, format: "money" },
        { header: "Pagos a proveedores", key: "supplierPayments", width: 19, format: "money" },
        { header: "Total egresos", key: "outflow", width: 15, format: "money" },
        { header: "Neto", key: "net", width: 14, format: "money" },
      ],
      rows: data.rows,
      totals: [...INCOME_KEYS],
    },
  ]);
});

export default router;


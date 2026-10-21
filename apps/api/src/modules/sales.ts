import { Router } from "express";
import { z } from "zod";
import { prisma, type Prisma } from "../lib/prisma.js";
import { notFound } from "../lib/errors.js";
import { dateStr, listQuery, paymentMethod } from "../lib/validate.js";
import { dayRangeUtc } from "../lib/dates.js";
import { round2 } from "../lib/money.js";
import { sendXlsx } from "../lib/xlsx.js";
import { excelDate, methodLabel, resolveDays } from "./reporting.js";
import { imageUrl } from "../lib/storage.js";
import { countryByCode } from "../lib/countries.js";
import { ctx, requireOwner, requirePerm } from "../middleware/auth.js";
import { createSale, saleInputSchema, voidSale } from "../services/sales.js";

const router = Router();

const listSchema = listQuery.extend({
  from: dateStr.optional(),
  to: dateStr.optional(),
  period: z.enum(["today", "week", "month", "year"]).optional(),
  method: paymentMethod.optional(),
  status: z.enum(["COMPLETED", "VOIDED"]).optional(),
  clientId: z.string().max(40).optional(),
  userId: z.string().max(40).optional(),
});

type ListFilters = z.infer<typeof listSchema>;

/** Filtros del historial: rango en la tz del negocio, #número, cliente, producto o IMEI. */
function buildWhere(businessId: string, tz: string, f: ListFilters): Prisma.SaleWhereInput {
  const where: Prisma.SaleWhereInput = { businessId };
  if (f.period || f.from || f.to) {
    const { from, to } = resolveDays(tz, f);
    where.createdAt = dayRangeUtc(tz, from, to);
  }
  if (f.method) where.method = f.method;
  if (f.status) where.status = f.status;
  if (f.clientId) where.clientId = f.clientId;
  if (f.userId) where.userId = f.userId;
  if (f.q) {
    const q = f.q.trim();
    const n = Number(q.replace(/^#/, ""));
    where.OR = [
      ...(Number.isInteger(n) && n > 0 && n < 2_147_483_647 ? [{ number: n }] : []),
      { client: { name: { contains: q, mode: "insensitive" as const } } },
      { items: { some: { name: { contains: q, mode: "insensitive" as const } } } },
      { items: { some: { serials: { has: q } } } },
    ];
  }
  return where;
}

async function sellerNames(userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

router.get("/", requirePerm("sales_view"), async (req, res) => {
  const a = ctx(req);
  const f = listSchema.parse(req.query);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: a.businessId }, select: { timezone: true } });
  const where = buildWhere(a.businessId, business.timezone, f);
  // Los KPIs cuentan solo ventas completadas, salvo que se filtre por anuladas
  const summaryWhere: Prisma.SaleWhereInput = { ...where, status: f.status ?? "COMPLETED" };

  const [rows, total, agg, costItems] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: { client: { select: { id: true, name: true } }, _count: { select: { items: true } } },
    }),
    prisma.sale.count({ where }),
    prisma.sale.aggregate({ where: summaryWhere, _sum: { total: true }, _count: true }),
    prisma.saleItem.findMany({ where: { sale: summaryWhere }, select: { quantity: true, unitCost: true } }),
  ]);
  const names = await sellerNames(rows.map((r) => r.userId));
  const sum = agg._sum.total?.toNumber() ?? 0;
  const cost = costItems.reduce((acc, i) => acc + i.quantity.toNumber() * i.unitCost.toNumber(), 0);

  res.json({
    items: rows.map((r) => ({ ...r, seller: r.userId ? names.get(r.userId) ?? null : null })),
    total,
    page: f.page,
    pageSize: f.pageSize,
    summary: {
      total: round2(sum),
      count: agg._count,
      avgTicket: agg._count ? round2(sum / agg._count) : 0,
      profit: round2(sum - cost),
    },
  });
});

router.get("/export.xlsx", requirePerm("sales_view"), async (req, res) => {
  const a = ctx(req);
  const f = listSchema.parse(req.query);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: a.businessId }, select: { timezone: true } });
  const tz = business.timezone;
  const sales = await prisma.sale.findMany({
    where: buildWhere(a.businessId, tz, f),
    orderBy: { createdAt: "asc" },
    take: 20_000,
    include: { client: { select: { name: true, document: true } }, items: true },
  });
  const names = await sellerNames(sales.map((s) => s.userId));
  const status = (s: string) => (s === "COMPLETED" ? "Completada" : "Anulada");

  await sendXlsx(res, `ventas_${f.from ?? f.period ?? "todas"}${f.to ? `_${f.to}` : ""}`, [
    {
      name: "Ventas",
      columns: [
        { header: "Fecha", key: "date", width: 18, format: "datetime" },
        { header: "Número", key: "number", width: 10, format: "int" },
        { header: "Cliente", key: "client", width: 28 },
        { header: "Documento", key: "document", width: 14 },
        { header: "Vendedor", key: "seller", width: 20 },
        { header: "Método de pago", key: "method", width: 16 },
        { header: "Subtotal", key: "subtotal", format: "money" },
        { header: "Descuento", key: "discount", format: "money" },
        { header: "Total", key: "total", format: "money" },
        { header: "Estado", key: "status", width: 12 },
        { header: "Notas", key: "notes", width: 30 },
      ],
      rows: sales.map((s) => ({
        date: excelDate(tz, s.createdAt),
        number: s.number,
        client: s.client?.name ?? "",
        document: s.client?.document ?? "",
        seller: s.userId ? names.get(s.userId) ?? "" : "",
        method: methodLabel(s.method),
        subtotal: s.subtotal.toNumber(),
        discount: s.discountTotal.toNumber(),
        total: s.status === "COMPLETED" ? s.total.toNumber() : 0,
        status: status(s.status),
        notes: s.notes ?? "",
      })),
      totals: ["subtotal", "discount", "total"],
    },
    {
      name: "Detalle",
      columns: [
        { header: "Fecha", key: "date", width: 18, format: "datetime" },
        { header: "Venta", key: "number", width: 10, format: "int" },
        { header: "Producto", key: "name", width: 36 },
        { header: "Cantidad", key: "quantity", format: "qty" },
        { header: "Precio unitario", key: "unitPrice", width: 15, format: "money" },
        { header: "Costo unitario", key: "unitCost", width: 15, format: "money" },
        { header: "Subtotal", key: "subtotal", format: "money" },
        { header: "IMEI / Serie", key: "serials", width: 34 },
        { header: "Garantía hasta", key: "warranty", width: 15, format: "date" },
        { header: "Estado", key: "status", width: 12 },
      ],
      rows: sales.flatMap((s) =>
        s.items.map((i) => ({
          date: excelDate(tz, s.createdAt),
          number: s.number,
          name: i.name,
          quantity: i.quantity.toNumber(),
          unitPrice: i.unitPrice.toNumber(),
          unitCost: i.unitCost.toNumber(),
          subtotal: i.subtotal.toNumber(),
          serials: i.serials.join(", "),
          warranty: i.warrantyUntil,
          status: status(s.status),
        })),
      ),
    },
  ]);
});

router.get("/:id", requirePerm("sales_view", "sales_create"), async (req, res) => {
  const a = ctx(req);
  const sale = await prisma.sale.findFirst({
    where: { id: String(req.params.id), businessId: a.businessId },
    include: {
      items: true,
      client: { select: { id: true, name: true, phone: true, document: true } },
      business: {
        select: {
          name: true,
          logoKey: true,
          address: true,
          phone: true,
          taxId: true,
          receiptFooter: true,
          receiptShowLogo: true,
          currency: true,
          country: true,
          timezone: true,
        },
      },
    },
  });
  if (!sale) throw notFound("La venta no existe.");
  const seller = sale.userId
    ? await prisma.user.findUnique({ where: { id: sale.userId }, select: { name: true } })
    : null;
  const { logoKey, ...business } = sale.business;
  res.json({
    ...sale,
    seller: seller?.name ?? null,
    business: {
      ...business,
      logoUrl: imageUrl(logoKey, 200),
      currencySymbol: countryByCode(business.country)?.symbol ?? business.currency,
    },
  });
});

router.post("/", requirePerm("sales_create"), async (req, res) => {
  const a = ctx(req);
  const input = saleInputSchema.parse(req.body);
  const sale = await createSale({ businessId: a.businessId, userId: a.userId }, input);
  res.status(201).json(sale);
});

router.post("/:id/void", requireOwner, async (req, res) => {
  const a = ctx(req);
  res.json(await voidSale({ businessId: a.businessId, userId: a.userId }, String(req.params.id)));
});

export default router;

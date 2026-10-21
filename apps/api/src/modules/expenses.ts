import { Router } from "express";
import { z } from "zod";
import { prisma, type Prisma } from "../lib/prisma.js";
import { badRequest, notFound } from "../lib/errors.js";
import { dateStr, listQuery, money, optId, optStr, paymentMethod, qty } from "../lib/validate.js";
import { dayRangeUtc, todayYmd } from "../lib/dates.js";
import { imageUrl } from "../lib/storage.js";
import { ctx, requireOwner, requirePerm } from "../middleware/auth.js";
import { moveStock } from "../services/inventory.js";
import { sendXlsx } from "../lib/xlsx.js";
import { EXPENSE_LABEL, excelDate, methodLabel } from "./reporting.js";

const router = Router();

const CATEGORIES = ["RENT", "UTILITIES", "PAYROLL", "MERCHANDISE", "TRANSPORT", "ADVERTISING", "OTHER"] as const;

const listSchema = listQuery.extend({
  from: dateStr.optional(),
  to: dateStr.optional(),
  category: z.enum(CATEGORIES).optional(),
});

function buildWhere(businessId: string, tz: string, f: z.infer<typeof listSchema>): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = { businessId, deletedAt: null };
  if (f.from || f.to) {
    const today = todayYmd(tz);
    where.date = dayRangeUtc(tz, f.from ?? f.to ?? today, f.to ?? f.from ?? today);
  }
  if (f.category) where.category = f.category;
  if (f.q) where.description = { contains: f.q, mode: "insensitive" };
  return where;
}

router.get("/export.xlsx", requirePerm("expenses_view"), async (req, res) => {
  const a = ctx(req);
  const f = listSchema.parse(req.query);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: a.businessId }, select: { timezone: true } });
  const tz = business.timezone;
  const rows = await prisma.expense.findMany({
    where: buildWhere(a.businessId, tz, f),
    orderBy: { date: "asc" },
    take: 20_000,
    include: { supplier: { select: { name: true } } },
  });
  await sendXlsx(res, `gastos_${f.from ?? "todos"}${f.to && f.to !== f.from ? `_${f.to}` : ""}`, [
    {
      name: "Gastos",
      columns: [
        { header: "Fecha", key: "date", width: 18, format: "datetime" },
        { header: "Categoría", key: "category", width: 20 },
        { header: "Concepto", key: "description", width: 36 },
        { header: "Proveedor", key: "supplier", width: 26 },
        { header: "Método", key: "method", width: 16 },
        { header: "Monto", key: "amount", format: "money" },
      ],
      rows: rows.map((e) => ({
        date: excelDate(tz, e.date),
        category: EXPENSE_LABEL[e.category] ?? e.category,
        description: e.description ?? "",
        supplier: e.supplier?.name ?? "",
        method: methodLabel(e.method),
        amount: e.amount.toNumber(),
      })),
      totals: ["amount"],
    },
  ]);
});

router.get("/", requirePerm("expenses_view"), async (req, res) => {
  const a = ctx(req);
  const f = listSchema.parse(req.query);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: a.businessId }, select: { timezone: true } });
  const where = buildWhere(a.businessId, business.timezone, f);

  const [rows, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: { supplier: { select: { id: true, name: true } } },
    }),
    prisma.expense.count({ where }),
  ]);
  const productIds = [...new Set(rows.map((r) => r.productId).filter((x): x is string => Boolean(x)))];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, unit: true } })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  const items = rows.map(({ receiptKey, ...e }) => ({
    ...e,
    product: e.productId ? byId.get(e.productId) ?? null : null,
    receiptUrl: imageUrl(receiptKey, 1200),
  }));
  res.json({ items, total, page: f.page, pageSize: f.pageSize });
});

const expenseSchema = z
  .object({
    amount: money(0.01),
    category: z.enum(CATEGORIES),
    description: optStr(255),
    supplierId: optId,
    method: paymentMethod.nullish(),
    updatesInventory: z.boolean().default(false),
    productId: optId,
    quantity: qty(0.001, 999_999).nullish(),
    date: z.coerce.date().optional(),
    receiptKey: optStr(300),
  })
  .refine((v) => !v.updatesInventory || v.category === "MERCHANDISE", {
    message: "Solo las compras de mercancía actualizan el inventario",
    path: ["updatesInventory"],
  })
  .refine((v) => !v.updatesInventory || (v.productId && v.quantity), {
    message: "Selecciona el producto y la cantidad comprada",
    path: ["productId"],
  })
  .refine((v) => v.method !== "CREDIT" || Boolean(v.supplierId), {
    message: "Selecciona el proveedor para un gasto a crédito",
    path: ["supplierId"],
  });

router.post("/", requirePerm("expenses_create"), async (req, res) => {
  const a = ctx(req);
  const data = expenseSchema.parse(req.body);
  if (data.date && data.date.getTime() > Date.now() + 5 * 60_000) {
    throw badRequest("La fecha del gasto no puede ser futura.", { date: "No puede ser futura" });
  }
  if (data.receiptKey && !data.receiptKey.startsWith(`${a.businessId}/`)) throw badRequest("Comprobante inválido.");

  const expense = await prisma.$transaction(async (tx) => {
    if (data.supplierId) {
      const s = await tx.supplier.findFirst({ where: { id: data.supplierId, businessId: a.businessId, deletedAt: null } });
      if (!s) throw badRequest("El proveedor no existe.");
    }
    const updatesInventory = data.updatesInventory && data.category === "MERCHANDISE";
    const created = await tx.expense.create({
      data: {
        businessId: a.businessId,
        amount: data.amount,
        category: data.category,
        description: data.description ?? null,
        supplierId: data.supplierId ?? null,
        method: data.method ?? null,
        updatesInventory,
        productId: updatesInventory ? data.productId ?? null : null,
        quantity: updatesInventory ? data.quantity ?? null : null,
        date: data.date ?? new Date(),
        receiptKey: data.receiptKey ?? null,
        userId: a.userId,
      },
    });
    if (updatesInventory && data.productId && data.quantity) {
      await moveStock(tx, {
        businessId: a.businessId,
        productId: data.productId,
        quantity: data.quantity,
        type: "EXPENSE",
        reason: data.description ?? "Compra de mercancía",
        refId: created.id,
        userId: a.userId,
      });
    }
    if (data.method === "CREDIT" && data.supplierId) {
      await tx.supplierMovement.create({
        data: {
          businessId: a.businessId,
          supplierId: data.supplierId,
          type: "DEBT",
          amount: data.amount,
          description: data.description ?? "Gasto a crédito",
          userId: a.userId,
        },
      });
    }
    return created;
  });

  const { receiptKey, ...rest } = expense;
  res.status(201).json({ ...rest, receiptUrl: imageUrl(receiptKey, 1200) });
});

router.delete("/:id", requireOwner, async (req, res) => {
  const a = ctx(req);
  const found = await prisma.expense.findFirst({ where: { id: String(req.params.id), businessId: a.businessId, deletedAt: null } });
  if (!found) throw notFound("El gasto no existe.");
  await prisma.expense.update({ where: { id: found.id }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
});

export default router;

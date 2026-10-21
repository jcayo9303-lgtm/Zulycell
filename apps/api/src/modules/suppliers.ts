import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { badRequest, notFound } from "../lib/errors.js";
import { listQuery, money, optEmail, optPhone, optStr, paymentMethod, reqStr } from "../lib/validate.js";
import { round2 } from "../lib/money.js";
import { imageUrl } from "../lib/storage.js";
import { ctx, requirePerm } from "../middleware/auth.js";
import { sendXlsx } from "../lib/xlsx.js";

const router = Router();
router.use(requirePerm("inventory_edit"));

const supplierSchema = z.object({
  name: reqStr(100),
  phone: optPhone,
  document: optStr(20),
  address: optStr(255),
  email: optEmail,
  notes: optStr(500),
});

/** Saldo por pagar por proveedor: Σ DEBT − Σ PAYMENT */
export async function supplierBalances(businessId: string, supplierIds?: string[]) {
  const groups = await prisma.supplierMovement.groupBy({
    by: ["supplierId", "type"],
    where: { businessId, supplier: { deletedAt: null }, ...(supplierIds ? { supplierId: { in: supplierIds } } : {}) },
    _sum: { amount: true },
  });
  const map = new Map<string, number>();
  for (const g of groups) {
    const v = g._sum.amount?.toNumber() ?? 0;
    map.set(g.supplierId, round2((map.get(g.supplierId) ?? 0) + (g.type === "DEBT" ? v : -v)));
  }
  return map;
}

async function findSupplier(businessId: string, id: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id, businessId, deletedAt: null } });
  if (!supplier) throw notFound("El proveedor no existe.");
  return supplier;
}

router.get("/", async (req, res) => {
  const { businessId } = ctx(req);
  const { q, page, pageSize } = listQuery.parse(req.query);
  const where: Prisma.SupplierWhereInput = { businessId, deletedAt: null };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { document: { contains: q, mode: "insensitive" } },
    ];
  }
  const [items, total, count, balances] = await Promise.all([
    prisma.supplier.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.supplier.count({ where }),
    prisma.supplier.count({ where: { businessId, deletedAt: null } }),
    supplierBalances(businessId),
  ]);
  const totalPayable = round2([...balances.values()].filter((b) => b > 0).reduce((a, b) => a + b, 0));
  res.json({
    items: items.map((s) => ({ ...s, balance: balances.get(s.id) ?? 0 })),
    total,
    page,
    pageSize,
    stats: { count, totalPayable },
  });
});

router.post("/", async (req, res) => {
  const { businessId } = ctx(req);
  const data = supplierSchema.parse(req.body);
  const supplier = await prisma.supplier.create({ data: { ...data, businessId } });
  res.status(201).json({ ...supplier, balance: 0 });
});

router.get("/export.xlsx", async (req, res) => {
  const { businessId } = ctx(req);
  const [suppliers, balances] = await Promise.all([
    prisma.supplier.findMany({ where: { businessId, deletedAt: null }, orderBy: { name: "asc" } }),
    supplierBalances(businessId),
  ]);
  await sendXlsx(res, `proveedores-${new Date().toISOString().slice(0, 10)}`, [
    {
      name: "Proveedores",
      columns: [
        { header: "Nombre", key: "name", width: 30 },
        { header: "Teléfono", key: "phone", width: 14 },
        { header: "Documento", key: "document", width: 14 },
        { header: "Email", key: "email", width: 26 },
        { header: "Dirección", key: "address", width: 30 },
        { header: "Notas", key: "notes", width: 30 },
        { header: "Saldo por pagar", key: "balance", format: "money", width: 16 },
      ],
      rows: suppliers.map((x) => ({ ...x, balance: balances.get(x.id) ?? 0 })),
      totals: ["balance"],
    },
  ]);
});

router.get("/:id", async (req, res) => {
  const { businessId } = ctx(req);
  const supplier = await findSupplier(businessId, req.params.id);
  const [balances, purchases, movements] = await Promise.all([
    supplierBalances(businessId, [supplier.id]),
    prisma.purchase.findMany({
      where: { supplierId: supplier.id, businessId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: { items: true },
    }),
    prisma.supplierMovement.findMany({
      where: { supplierId: supplier.id, businessId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  res.json({
    ...supplier,
    balance: balances.get(supplier.id) ?? 0,
    purchases: purchases.map((p) => ({ ...p, invoiceImageUrl: imageUrl(p.invoiceImageKey, 1200) })),
    movements,
  });
});

router.put("/:id", async (req, res) => {
  const { businessId } = ctx(req);
  await findSupplier(businessId, req.params.id);
  const data = supplierSchema.parse(req.body);
  res.json(await prisma.supplier.update({ where: { id: req.params.id }, data }));
});

router.delete("/:id", async (req, res) => {
  const { businessId } = ctx(req);
  await findSupplier(businessId, req.params.id);
  await prisma.supplier.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
});

const paymentSchema = z.object({
  amount: money(0.01),
  method: paymentMethod.exclude(["CREDIT"]).nullish(),
  notes: optStr(255),
});

router.post("/:id/payments", async (req, res) => {
  const { businessId, userId } = ctx(req);
  await findSupplier(businessId, req.params.id);
  const data = paymentSchema.parse(req.body);
  const balance = (await supplierBalances(businessId, [req.params.id])).get(req.params.id) ?? 0;
  if (data.amount > balance + 0.001) {
    throw badRequest("El pago no puede superar el saldo pendiente.", { amount: `Máximo ${balance}` });
  }
  const movement = await prisma.supplierMovement.create({
    data: {
      businessId,
      supplierId: req.params.id,
      type: "PAYMENT",
      amount: data.amount,
      method: data.method ?? null,
      description: data.notes ?? null,
      userId,
    },
  });
  res.status(201).json(movement);
});

export default router;

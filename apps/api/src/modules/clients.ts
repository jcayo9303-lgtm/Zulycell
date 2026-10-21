import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { badRequest, notFound } from "../lib/errors.js";
import { listQuery, money, optEmail, optPhone, optStr, paymentMethod, reqStr } from "../lib/validate.js";
import { round2 } from "../lib/money.js";
import { waLink } from "../lib/messaging.js";
import { countryByCode } from "../lib/countries.js";
import { ctx, requirePerm } from "../middleware/auth.js";
import { sendXlsx } from "../lib/xlsx.js";

const router = Router();

const clientSchema = z.object({
  name: reqStr(100),
  phone: optPhone,
  document: optStr(20),
  address: optStr(255),
  email: optEmail,
});

/** Saldo por cobrar por cliente: Σ DEBT − Σ PAYMENT */
export async function clientBalances(businessId: string, clientIds?: string[]) {
  const groups = await prisma.clientMovement.groupBy({
    by: ["clientId", "type"],
    where: { businessId, client: { deletedAt: null }, ...(clientIds ? { clientId: { in: clientIds } } : {}) },
    _sum: { amount: true },
  });
  const map = new Map<string, number>();
  for (const g of groups) {
    const v = g._sum.amount?.toNumber() ?? 0;
    map.set(g.clientId, round2((map.get(g.clientId) ?? 0) + (g.type === "DEBT" ? v : -v)));
  }
  return map;
}

async function findClient(businessId: string, id: string) {
  const client = await prisma.client.findFirst({ where: { id, businessId, deletedAt: null } });
  if (!client) throw notFound("El cliente no existe.");
  return client;
}

router.get("/", requirePerm("clients_view", "clients_edit", "sales_create"), async (req, res) => {
  const { businessId } = ctx(req);
  const { q, page, pageSize } = listQuery.parse(req.query);
  const withDebt = req.query.withDebt === "true";

  const where: Prisma.ClientWhereInput = { businessId, deletedAt: null };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { document: { contains: q, mode: "insensitive" } },
    ];
  }

  const all = await clientBalances(businessId);
  if (withDebt) where.id = { in: [...all].filter(([, b]) => b > 0).map(([id]) => id) };

  const [items, total, count] = await Promise.all([
    prisma.client.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.client.count({ where }),
    prisma.client.count({ where: { businessId, deletedAt: null } }),
  ]);
  const totalReceivable = round2([...all.values()].filter((b) => b > 0).reduce((a, b) => a + b, 0));

  res.json({
    items: items.map((c) => ({ ...c, balance: all.get(c.id) ?? 0 })),
    total,
    page,
    pageSize,
    stats: { count, totalReceivable },
  });
});

router.post("/", requirePerm("clients_edit", "sales_create"), async (req, res) => {
  const { businessId } = ctx(req);
  const data = clientSchema.parse(req.body);
  const client = await prisma.client.create({ data: { ...data, businessId } });
  res.status(201).json({ ...client, balance: 0 });
});

router.get("/export.xlsx", requirePerm("clients_view", "clients_edit"), async (req, res) => {
  const { businessId } = ctx(req);
  const [clients, balances] = await Promise.all([
    prisma.client.findMany({ where: { businessId, deletedAt: null }, orderBy: { name: "asc" } }),
    clientBalances(businessId),
  ]);
  await sendXlsx(res, `clientes-${new Date().toISOString().slice(0, 10)}`, [
    {
      name: "Clientes",
      columns: [
        { header: "Nombre", key: "name", width: 30 },
        { header: "Celular", key: "phone", width: 14 },
        { header: "Documento", key: "document", width: 14 },
        { header: "Email", key: "email", width: 26 },
        { header: "Dirección", key: "address", width: 30 },
        { header: "Saldo por cobrar", key: "balance", format: "money", width: 16 },
        { header: "Registrado", key: "createdAt", format: "date", width: 12 },
      ],
      rows: clients.map((c) => ({ ...c, balance: balances.get(c.id) ?? 0 })),
      totals: ["balance"],
    },
  ]);
});

router.get("/:id", requirePerm("clients_view", "clients_edit"), async (req, res) => {
  const { businessId } = ctx(req);
  const client = await findClient(businessId, String(req.params.id));
  const [balances, purchased, sales] = await Promise.all([
    clientBalances(businessId, [client.id]),
    prisma.sale.aggregate({ where: { clientId: client.id, businessId, status: "COMPLETED" }, _sum: { total: true }, _count: true }),
    prisma.sale.findMany({
      where: { clientId: client.id, businessId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, number: true, total: true, method: true, status: true, createdAt: true },
    }),
  ]);
  res.json({
    ...client,
    balance: balances.get(client.id) ?? 0,
    totalPurchased: purchased._sum.total?.toNumber() ?? 0,
    salesCount: purchased._count,
    sales,
  });
});

router.put("/:id", requirePerm("clients_edit"), async (req, res) => {
  const { businessId } = ctx(req);
  await findClient(businessId, String(req.params.id));
  const data = clientSchema.parse(req.body);
  res.json(await prisma.client.update({ where: { id: String(req.params.id) }, data }));
});

router.delete("/:id", requirePerm("clients_edit"), async (req, res) => {
  const { businessId } = ctx(req);
  await findClient(businessId, String(req.params.id));
  await prisma.client.update({ where: { id: String(req.params.id) }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
});

router.get("/:id/movements", requirePerm("clients_view", "clients_edit"), async (req, res) => {
  const { businessId } = ctx(req);
  await findClient(businessId, String(req.params.id));
  res.json(
    await prisma.clientMovement.findMany({
      where: { clientId: String(req.params.id), businessId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
});

const debtSchema = z.object({ amount: money(0.01), description: optStr(255) });

router.post("/:id/debts", requirePerm("clients_edit"), async (req, res) => {
  const { businessId, userId } = ctx(req);
  await findClient(businessId, String(req.params.id));
  const data = debtSchema.parse(req.body);
  const movement = await prisma.clientMovement.create({
    data: { businessId, clientId: String(req.params.id), type: "DEBT", amount: data.amount, description: data.description ?? null, userId },
  });
  res.status(201).json(movement);
});

const paymentSchema = z.object({
  amount: money(0.01),
  method: paymentMethod.exclude(["CREDIT"]).nullish(),
  notes: optStr(255),
});

router.post("/:id/payments", requirePerm("clients_edit"), async (req, res) => {
  const { businessId, userId } = ctx(req);
  await findClient(businessId, String(req.params.id));
  const data = paymentSchema.parse(req.body);
  const balance = (await clientBalances(businessId, [String(req.params.id)])).get(String(req.params.id)) ?? 0;
  if (data.amount > balance + 0.001) {
    throw badRequest("El abono no puede superar la deuda pendiente.", { amount: `Máximo ${balance}` });
  }
  const movement = await prisma.clientMovement.create({
    data: {
      businessId,
      clientId: String(req.params.id),
      type: "PAYMENT",
      amount: data.amount,
      method: data.method ?? null,
      description: data.notes ?? null,
      userId,
    },
  });
  res.status(201).json(movement);
});

router.get("/:id/reminder", requirePerm("clients_view", "clients_edit"), async (req, res) => {
  const { businessId } = ctx(req);
  const client = await findClient(businessId, String(req.params.id));
  if (!client.phone) throw badRequest("El cliente no tiene celular registrado.");
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const balance = (await clientBalances(businessId, [client.id])).get(client.id) ?? 0;
  const symbol = countryByCode(business.country)?.symbol ?? business.currency;
  const text =
    balance > 0
      ? `Hola ${client.name}, te recordamos que tienes un saldo pendiente de ${symbol} ${balance.toFixed(2)} con ${business.name}. ¡Gracias!`
      : `Hola ${client.name}, gracias por tu preferencia. — ${business.name}`;
  res.json({ url: waLink(client.phone, text), balance });
});

export default router;

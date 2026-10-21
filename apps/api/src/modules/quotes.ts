import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../lib/prisma.js";
import { badRequest, notFound } from "../lib/errors.js";
import { dateStr, discountType, listQuery, money, optId, optStr, paymentMethod, qty } from "../lib/validate.js";
import { lineSubtotal, totals } from "../lib/money.js";
import { imageUrl } from "../lib/storage.js";
import { countryByCode } from "../lib/countries.js";
import { todayYmd } from "../lib/dates.js";
import { nextNumber } from "../services/numbering.js";
import { createSale } from "../services/sales.js";
import { ctx, requirePerm } from "../middleware/auth.js";

const router = Router();
router.use(requirePerm("sales_create"));

const itemSchema = z.object({
  productId: optId,
  variantId: optId,
  name: z.string().trim().min(1, "Falta el nombre").max(160),
  quantity: qty(0.001, 99_999),
  unitPrice: money(0.01),
  discountType: discountType.nullish(),
  discountValue: money(0).nullish(),
});

const quoteSchema = z
  .object({
    clientId: optId,
    clientName: optStr(100),
    date: dateStr.optional(),
    validUntil: z.preprocess((v) => (v === "" ? null : v), dateStr.nullish()),
    items: z.array(itemSchema).min(1, "Agrega al menos un producto"),
    discountType: discountType.nullish(),
    discountValue: money(0).nullish(),
    notes: optStr(500),
  })
  .refine((v) => !v.validUntil || !v.date || v.validUntil >= v.date, {
    message: "La vigencia debe ser igual o posterior a la fecha",
    path: ["validUntil"],
  });

type QuoteInput = z.infer<typeof quoteSchema>;

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

async function buildData(tx: Tx, businessId: string, input: QuoteInput) {
  if (input.clientId) {
    const client = await tx.client.findFirst({ where: { id: input.clientId, businessId, deletedAt: null } });
    if (!client) throw badRequest("El cliente no existe.");
  }
  const items = input.items.map((i) => ({
    productId: i.productId ?? null,
    variantId: i.variantId ?? null,
    name: i.name,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    discountType: i.discountType ?? null,
    discountValue: i.discountValue ?? 0,
    subtotal: lineSubtotal(i),
  }));
  const t = totals(items, { type: input.discountType, value: input.discountValue });
  return {
    items,
    data: {
      clientId: input.clientId ?? null,
      clientName: input.clientName ?? null,
      validUntil: input.validUntil ? toDate(input.validUntil) : null,
      subtotal: t.subtotal,
      discountType: input.discountType ?? null,
      discountValue: input.discountValue ?? 0,
      discountTotal: t.discountTotal,
      total: t.total,
      notes: input.notes ?? null,
    },
  };
}

async function findQuote(businessId: string, id: string) {
  const quote = await prisma.quote.findFirst({
    where: { id, businessId, deletedAt: null },
    include: { items: true, client: true },
  });
  if (!quote) throw notFound("La cotización no existe.");
  return quote;
}

router.get("/", async (req, res) => {
  const { businessId } = ctx(req);
  const { q, page, pageSize } = listQuery.parse(req.query);
  const where: Prisma.QuoteWhereInput = { businessId, deletedAt: null };
  if (q) {
    const n = Number(q);
    where.OR = [
      { clientName: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
      ...(Number.isInteger(n) ? [{ number: n }] : []),
    ];
  }
  const [items, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: { number: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { client: { select: { name: true } } },
    }),
    prisma.quote.count({ where }),
  ]);
  res.json({
    items: items.map(({ client, ...q }) => ({ ...q, clientName: client?.name ?? q.clientName })),
    total,
    page,
    pageSize,
  });
});

router.get("/:id", async (req, res) => {
  const { businessId } = ctx(req);
  const quote = await findQuote(businessId, req.params.id);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  res.json({
    ...quote,
    business: {
      name: business.name,
      address: business.address,
      phone: business.phone,
      email: business.email,
      taxId: business.taxId,
      currency: business.currency,
      currencySymbol: countryByCode(business.country)?.symbol ?? business.currency,
      logoUrl: business.receiptShowLogo ? imageUrl(business.logoKey, 240) : null,
    },
  });
});

router.post("/", async (req, res) => {
  const { businessId } = ctx(req);
  const input = quoteSchema.parse(req.body);
  const quote = await prisma.$transaction(async (tx) => {
    const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });
    const date = input.date ?? todayYmd(business.timezone);
    if (input.validUntil && input.validUntil < date) throw badRequest("La vigencia debe ser igual o posterior a la fecha.");
    const { items, data } = await buildData(tx, businessId, input);
    const number = await nextNumber(tx, businessId, "nextQuoteNumber");
    return tx.quote.create({
      data: { ...data, businessId, number, date: toDate(date), items: { create: items } },
      include: { items: true },
    });
  });
  res.status(201).json(quote);
});

router.put("/:id", async (req, res) => {
  const { businessId } = ctx(req);
  const existing = await findQuote(businessId, req.params.id);
  if (existing.status === "CONVERTED") throw badRequest("La cotización ya se convirtió en venta y no se puede editar.");
  const input = quoteSchema.parse(req.body);
  const quote = await prisma.$transaction(async (tx) => {
    const { items, data } = await buildData(tx, businessId, input);
    await tx.quoteItem.deleteMany({ where: { quoteId: existing.id } });
    return tx.quote.update({
      where: { id: existing.id },
      data: { ...data, ...(input.date ? { date: toDate(input.date) } : {}), items: { create: items } },
      include: { items: true },
    });
  });
  res.json(quote);
});

router.post("/:id/duplicate", async (req, res) => {
  const { businessId } = ctx(req);
  const src = await findQuote(businessId, req.params.id);
  const quote = await prisma.$transaction(async (tx) => {
    const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });
    const number = await nextNumber(tx, businessId, "nextQuoteNumber");
    return tx.quote.create({
      data: {
        businessId,
        number,
        clientId: src.clientId,
        clientName: src.clientName,
        date: toDate(todayYmd(business.timezone)),
        validUntil: null,
        subtotal: src.subtotal,
        discountType: src.discountType,
        discountValue: src.discountValue,
        discountTotal: src.discountTotal,
        total: src.total,
        notes: src.notes,
        items: {
          create: src.items.map(({ id: _id, quoteId: _q, ...item }) => item),
        },
      },
    });
  });
  res.status(201).json(quote);
});

const convertSchema = z.object({ method: paymentMethod, received: money(0).nullish() });

router.post("/:id/convert", async (req, res) => {
  const a = ctx(req);
  const quote = await findQuote(a.businessId, req.params.id);
  if (quote.status === "CONVERTED") throw badRequest("La cotización ya se convirtió en venta.");
  const { method, received } = convertSchema.parse(req.body);
  const items = quote.items.filter((i) => i.productId);
  if (items.length !== quote.items.length) {
    throw badRequest("Todos los ítems deben estar vinculados a un producto del inventario para convertir en venta.");
  }
  if (method === "CREDIT" && !quote.clientId) throw badRequest("Para vender a crédito la cotización debe tener un cliente registrado.");

  const sale = await prisma.$transaction(async (tx) => {
    const sale = await createSale(
      { businessId: a.businessId, userId: a.userId },
      {
        items: items.map((i) => ({
          productId: i.productId!,
          variantId: i.variantId,
          quantity: i.quantity.toNumber(),
          unitPrice: i.unitPrice.toNumber(),
          discountType: i.discountType,
          discountValue: i.discountValue.toNumber(),
        })),
        discountType: quote.discountType,
        discountValue: quote.discountValue.toNumber(),
        method,
        received: received ?? null,
        clientId: quote.clientId,
        notes: `Cotización #${quote.number}`,
        quoteId: quote.id,
      },
      tx,
    );
    await tx.quote.update({ where: { id: quote.id }, data: { status: "CONVERTED", saleId: sale.id } });
    return sale;
  });
  res.status(201).json(sale);
});

router.delete("/:id", async (req, res) => {
  const { businessId } = ctx(req);
  await findQuote(businessId, req.params.id);
  await prisma.quote.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
});

export default router;

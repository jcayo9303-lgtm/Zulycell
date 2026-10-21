import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../lib/prisma.js";
import { badRequest, HttpError, notFound } from "../lib/errors.js";
import { email, id, listQuery, money, optId, optStr, paymentMethod, qty, reqStr } from "../lib/validate.js";
import { round2 } from "../lib/money.js";
import { imageUrl } from "../lib/storage.js";
import { countryByCode } from "../lib/countries.js";
import { todayYmd } from "../lib/dates.js";
import { sendEmail } from "../lib/messaging.js";
import { logger } from "../lib/logger.js";
import { nextNumber } from "../services/numbering.js";
import { ctx, requireOwner, requirePerm } from "../middleware/auth.js";

const router = Router();
router.use(requirePerm("sales_create"));

const itemSchema = z.object({
  productId: optId,
  name: reqStr(160),
  quantity: qty(0.001, 99_999),
  unitPrice: money(0.01),
  taxRate: z.coerce.number().min(0).max(100),
  discount: money(0).nullish(),
});

const invoiceSchema = z
  .object({
    type: z.enum(["SALE", "CREDIT_NOTE", "DEBIT_NOTE"]).default("SALE"),
    clientId: id,
    receiverName: reqStr(100),
    receiverTaxId: reqStr(20),
    receiverAddress: reqStr(255),
    receiverEmail: email,
    items: z.array(itemSchema).min(1, "Agrega al menos un producto o servicio"),
    method: paymentMethod,
    notes: optStr(500),
    relatedInvoiceId: optId,
  })
  .refine((v) => v.type === "SALE" || Boolean(v.relatedInvoiceId), {
    message: "Las notas deben referenciar una factura emitida",
    path: ["relatedInvoiceId"],
  });

type InvoiceInput = z.infer<typeof invoiceSchema>;

function computeLines(items: InvoiceInput["items"]) {
  return items.map((i) => {
    const gross = round2(i.quantity * i.unitPrice);
    const discount = round2(Math.min(i.discount ?? 0, gross));
    const subtotal = round2(gross - discount);
    return {
      productId: i.productId ?? null,
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxRate: i.taxRate,
      discount,
      subtotal,
      tax: round2((subtotal * i.taxRate) / 100),
    };
  });
}

/** Subtotal (antes de descuento) − descuento + impuesto = total */
function computeTotals(lines: ReturnType<typeof computeLines>) {
  const discountTotal = round2(lines.reduce((a, l) => a + l.discount, 0));
  const subtotal = round2(lines.reduce((a, l) => a + l.subtotal + l.discount, 0));
  const taxTotal = round2(lines.reduce((a, l) => a + l.tax, 0));
  return { subtotal, discountTotal, taxTotal, total: round2(subtotal - discountTotal + taxTotal) };
}

async function validateInput(tx: Tx, businessId: string, input: InvoiceInput) {
  const business = await tx.business.findUniqueOrThrow({ where: { id: businessId } });
  const rates = countryByCode(business.country)?.taxRates ?? [0];
  for (const item of input.items) {
    if (!rates.includes(item.taxRate)) throw badRequest(`Tarifa de impuesto no válida. Usa: ${rates.join("%, ")}%.`);
  }
  const client = await tx.client.findFirst({ where: { id: input.clientId, businessId, deletedAt: null } });
  if (!client) throw badRequest("El cliente no existe.");
  if (input.relatedInvoiceId) {
    const related = await tx.invoice.findFirst({ where: { id: input.relatedInvoiceId, businessId, status: "ISSUED", type: "SALE" } });
    if (!related) throw badRequest("La factura relacionada no existe o no está emitida.");
  }
  return business;
}

async function findInvoice(businessId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, businessId }, include: { items: true } });
  if (!invoice) throw notFound("La factura no existe.");
  return invoice;
}

router.get("/", async (req, res) => {
  const { businessId } = ctx(req);
  const { q, page, pageSize } = listQuery.parse(req.query);
  const where: Prisma.InvoiceWhereInput = { businessId };
  if (q) {
    const n = Number(q);
    where.OR = [
      { receiverName: { contains: q, mode: "insensitive" } },
      { receiverTaxId: { contains: q } },
      ...(Number.isInteger(n) ? [{ number: n }] : []),
    ];
  }
  const [items, total] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: [{ number: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.invoice.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

router.get("/:id", async (req, res) => {
  const { businessId } = ctx(req);
  const invoice = await findInvoice(businessId, req.params.id);
  const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const country = countryByCode(b.country);
  const related = invoice.relatedInvoiceId
    ? await prisma.invoice.findUnique({ where: { id: invoice.relatedInvoiceId }, select: { id: true, number: true, type: true } })
    : null;
  res.json({
    ...invoice,
    related,
    business: {
      name: b.name,
      address: b.address,
      phone: b.phone,
      email: b.email,
      taxId: b.taxId,
      currency: b.currency,
      currencySymbol: country?.symbol ?? b.currency,
      taxAuthority: country?.taxAuthority ?? "",
      logoUrl: b.receiptShowLogo ? imageUrl(b.logoKey, 240) : null,
    },
  });
});

router.post("/", async (req, res) => {
  const { businessId } = ctx(req);
  const input = invoiceSchema.parse(req.body);
  const invoice = await prisma.$transaction(async (tx) => {
    const business = await validateInput(tx, businessId, input);
    const lines = computeLines(input.items);
    return tx.invoice.create({
      data: {
        businessId,
        type: input.type,
        clientId: input.clientId,
        receiverName: input.receiverName,
        receiverTaxId: input.receiverTaxId,
        receiverAddress: input.receiverAddress,
        receiverEmail: input.receiverEmail,
        method: input.method,
        notes: input.notes ?? null,
        relatedInvoiceId: input.relatedInvoiceId ?? null,
        issueDate: new Date(`${todayYmd(business.timezone)}T00:00:00Z`),
        ...computeTotals(lines),
        items: { create: lines },
      },
      include: { items: true },
    });
  });
  res.status(201).json(invoice);
});

router.put("/:id", async (req, res) => {
  const { businessId } = ctx(req);
  const existing = await findInvoice(businessId, req.params.id);
  if (existing.status !== "DRAFT") throw badRequest("Solo se pueden editar facturas en borrador.");
  const input = invoiceSchema.parse(req.body);
  const invoice = await prisma.$transaction(async (tx) => {
    await validateInput(tx, businessId, input);
    const lines = computeLines(input.items);
    await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
    return tx.invoice.update({
      where: { id: existing.id },
      data: {
        type: input.type,
        clientId: input.clientId,
        receiverName: input.receiverName,
        receiverTaxId: input.receiverTaxId,
        receiverAddress: input.receiverAddress,
        receiverEmail: input.receiverEmail,
        method: input.method,
        notes: input.notes ?? null,
        relatedInvoiceId: input.relatedInvoiceId ?? null,
        ...computeTotals(lines),
        items: { create: lines },
      },
      include: { items: true },
    });
  });
  res.json(invoice);
});

const simulatedRef = () => `SIM-${randomBytes(12).toString("hex").toUpperCase()}`;

router.post("/:id/issue", async (req, res) => {
  const { businessId } = ctx(req);
  const invoice = await findInvoice(businessId, req.params.id);
  if (invoice.status !== "DRAFT") throw badRequest("La factura ya fue emitida.");
  const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  // Emisión simulada: la real requiere integrar el proveedor tecnológico de la autoridad tributaria (SIN Bolivia, DIAN Colombia, etc.).
  const updated = await prisma.$transaction(async (tx) =>
    tx.invoice.update({
      where: { id: invoice.id },
      data: {
        number: await nextNumber(tx, businessId, "nextInvoiceNumber"),
        status: "ISSUED",
        providerRef: simulatedRef(),
        issueDate: new Date(`${todayYmd(b.timezone)}T00:00:00Z`),
      },
    }),
  );
  res.json(updated);
});

router.post("/:id/void", requireOwner, async (req, res) => {
  const { businessId } = ctx(req);
  const invoice = await findInvoice(businessId, String(req.params.id));
  if (invoice.status === "DRAFT") {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "VOIDED" } });
    res.json({ ok: true });
    return;
  }
  if (invoice.status !== "ISSUED" || invoice.type !== "SALE") throw badRequest("Solo se pueden anular facturas de venta emitidas.");

  const creditNote = await prisma.$transaction(async (tx) => {
    const b = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });
    const number = await nextNumber(tx, businessId, "nextInvoiceNumber");
    const note = await tx.invoice.create({
      data: {
        businessId,
        number,
        type: "CREDIT_NOTE",
        status: "ISSUED",
        clientId: invoice.clientId,
        receiverName: invoice.receiverName,
        receiverTaxId: invoice.receiverTaxId,
        receiverAddress: invoice.receiverAddress,
        receiverEmail: invoice.receiverEmail,
        subtotal: invoice.subtotal,
        discountTotal: invoice.discountTotal,
        taxTotal: invoice.taxTotal,
        total: invoice.total,
        method: invoice.method,
        issueDate: new Date(`${todayYmd(b.timezone)}T00:00:00Z`),
        notes: `Anulación de la factura #${invoice.number}`,
        relatedInvoiceId: invoice.id,
        providerRef: simulatedRef(),
        items: { create: invoice.items.map(({ id: _id, invoiceId: _inv, ...item }) => item) },
      },
    });
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: "VOIDED" } });
    return note;
  });
  res.status(201).json(creditNote);
});

router.post("/:id/email", async (req, res) => {
  const { businessId } = ctx(req);
  const invoice = await findInvoice(businessId, req.params.id);
  if (invoice.status === "DRAFT") throw badRequest("Emite la factura antes de enviarla.");
  const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const symbol = countryByCode(b.country)?.symbol ?? b.currency;
  const kind = { SALE: "Factura", CREDIT_NOTE: "Nota crédito", DEBIT_NOTE: "Nota débito" }[invoice.type];
  const lines = invoice.items
    .map((i) => `- ${i.name}: ${i.quantity.toNumber()} × ${symbol} ${i.unitPrice.toFixed(2)} = ${symbol} ${i.subtotal.toFixed(2)}`)
    .join("\n");
  const text = [
    `${kind} N.º ${String(invoice.number).padStart(6, "0")} — ${b.name}`,
    `Fecha: ${invoice.issueDate.toISOString().slice(0, 10)}`,
    `Cliente: ${invoice.receiverName} (${invoice.receiverTaxId})`,
    "",
    lines,
    "",
    `Subtotal: ${symbol} ${invoice.subtotal.toFixed(2)}`,
    `Descuento: ${symbol} ${invoice.discountTotal.toFixed(2)}`,
    `Impuesto: ${symbol} ${invoice.taxTotal.toFixed(2)}`,
    `Total: ${symbol} ${invoice.total.toFixed(2)}`,
    "",
    `Código: ${invoice.providerRef ?? "—"}`,
  ].join("\n");
  try {
    await sendEmail(invoice.receiverEmail, `${kind} ${b.name} N.º ${invoice.number}`, text);
  } catch (err) {
    logger.error({ err }, "No se pudo enviar la factura");
    throw new HttpError(502, "No se pudo enviar el correo. Inténtalo en unos minutos.");
  }
  res.json({ ok: true, to: invoice.receiverEmail });
});

export default router;

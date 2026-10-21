import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { PaymentRequest } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { notFound } from "../lib/errors.js";
import { money, optStr } from "../lib/validate.js";
import { countryByCode } from "../lib/countries.js";
import { ctx, requirePerm } from "../middleware/auth.js";

// QR de pago (docs §21)

const router = Router();
router.use(requirePerm("sales_create"));

export const publicPayRouter = Router();

const dto = (p: PaymentRequest) => ({ ...p, url: `${config.publicUrl}/pagar/${p.token}` });

router.get("/", async (req, res) => {
  const rows = await prisma.paymentRequest.findMany({
    where: { businessId: ctx(req).businessId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(rows.map(dto));
});

const createSchema = z.object({ amount: money(0.01).nullish(), description: optStr(255) });

router.post("/", async (req, res) => {
  const data = createSchema.parse(req.body);
  const created = await prisma.paymentRequest.create({
    data: {
      businessId: ctx(req).businessId,
      token: randomBytes(16).toString("base64url"),
      amount: data.amount ?? null,
      description: data.description ?? null,
    },
  });
  res.status(201).json(dto(created));
});

async function setStatus(businessId: string, id: string, status: "PAID" | "CANCELLED") {
  const { count } = await prisma.paymentRequest.updateMany({
    where: { id, businessId, status: "PENDING" },
    data: { status, paidAt: status === "PAID" ? new Date() : null },
  });
  if (!count) throw notFound("El cobro no existe o ya fue cerrado.");
}

router.post("/:id/paid", async (req, res) => {
  await setStatus(ctx(req).businessId, String(req.params.id), "PAID");
  res.json({ ok: true });
});

router.post("/:id/cancel", async (req, res) => {
  await setStatus(ctx(req).businessId, String(req.params.id), "CANCELLED");
  res.json({ ok: true });
});

publicPayRouter.get("/:token", async (req, res) => {
  const p = await prisma.paymentRequest.findUnique({
    where: { token: String(req.params.token) },
    include: { business: { select: { name: true, currency: true, country: true } } },
  });
  if (!p) throw notFound("Este enlace de pago no existe.");
  // Aquí se integraría la pasarela de pago (QR interoperable / tarjeta) y su webhook para marcar PAID.
  res.json({
    businessName: p.business.name,
    amount: p.amount,
    description: p.description,
    status: p.status,
    currency: p.business.currency,
    currencySymbol: countryByCode(p.business.country)?.symbol ?? p.business.currency,
    createdAt: p.createdAt,
  });
});

export default router;

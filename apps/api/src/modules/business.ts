import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { badRequest } from "../lib/errors.js";
import { optEmail, optPhone, optStr, reqStr } from "../lib/validate.js";
import { COUNTRY_CODES, countryByCode } from "../lib/countries.js";
import { imageUrl } from "../lib/storage.js";
import { ctx, forgetAuth, requireOwner } from "../middleware/auth.js";

const router = Router();

router.get("/", async (req, res) => {
  const { businessId } = ctx(req);
  const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const country = countryByCode(b.country);
  res.json({
    id: b.id,
    name: b.name,
    type: b.type,
    country: b.country,
    countryName: country?.name ?? b.country,
    currency: b.currency,
    currencySymbol: country?.symbol ?? b.currency,
    taxRates: country?.taxRates ?? [0],
    taxAuthority: country?.taxAuthority ?? "",
    timezone: b.timezone,
    ownerName: b.ownerName,
    plan: b.plan,
    logoKey: b.logoKey,
    logoUrl: imageUrl(b.logoKey, 240),
    address: b.address,
    phone: b.phone,
    email: b.email,
    taxId: b.taxId,
    receiptShowLogo: b.receiptShowLogo,
    receiptFooter: b.receiptFooter,
    nextSaleNumber: b.nextSaleNumber,
    allowNegativeStock: b.allowNegativeStock,
    repairTerms: b.repairTerms,
    slug: b.slug,
  });
});

const updateSchema = z.object({
  name: reqStr(100),
  type: z.enum(["CELULARES", "GASTRONOMICO", "COMERCIO", "SERVICIOS", "MERCADOS", "OTRO"]),
  country: z.enum(COUNTRY_CODES),
  logoKey: optStr(300),
  address: optStr(255),
  phone: optPhone,
  email: optEmail,
  taxId: optStr(20),
  receiptShowLogo: z.boolean(),
  receiptFooter: optStr(255),
  nextSaleNumber: z.coerce.number().int().min(1).max(999_999_999),
  allowNegativeStock: z.boolean(),
  repairTerms: optStr(1000),
});

router.put("/", requireOwner, async (req, res) => {
  const { businessId } = ctx(req);
  const data = updateSchema.parse(req.body);
  const country = countryByCode(data.country)!;

  const last = await prisma.sale.aggregate({ where: { businessId }, _max: { number: true } });
  const minNext = (last._max.number ?? 0) + 1;
  if (data.nextSaleNumber < minNext) {
    throw badRequest(`La numeración no puede ser menor a ${minNext}.`, { nextSaleNumber: `Mínimo ${minNext}` });
  }

  const current = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { country: true } });
  await prisma.business.update({
    where: { id: businessId },
    data: {
      ...data,
      currency: country.currency,
      // La zona horaria solo cambia si cambia el país
      ...(current.country !== data.country ? { timezone: country.timezone } : {}),
    },
  });
  forgetAuth(businessId);
  res.json({ ok: true });
});

export default router;

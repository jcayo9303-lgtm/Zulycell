import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { unauthorized } from "../lib/errors.js";
import { reqStr } from "../lib/validate.js";
import { COUNTRY_CODES, countryByCode } from "../lib/countries.js";
import { imageUrl } from "../lib/storage.js";
import { verifyAccessToken } from "../lib/supabase.js";
import {
  SESSION_COOKIE,
  SIGNUP_COOKIE,
  clearAuthCookies,
  readSignupClaims,
  requireAuth,
  ctx,
  setSessionCookie,
  setSignupCookie,
} from "../middleware/auth.js";

const router = Router();

/**
 * Acceso con Supabase Auth (email + contraseña, con verificación de email):
 *   1. El navegador inicia sesión en Supabase y envía su access token a POST /session.
 *   2. La API verifica el token (JWKS) y abre su propia sesión en cookie HttpOnly.
 *      Si el usuario aún no tiene negocio, pasa al registro del negocio (POST /signup).
 * Supabase se encarga de contraseñas, verificación de email, recuperación y límites de intentos.
 */

router.post("/session", async (req, res) => {
  const { accessToken } = z.object({ accessToken: z.string().min(20).max(4000) }).parse(req.body);
  const identity = await verifyAccessToken(accessToken);
  if (!identity) throw unauthorized("No pudimos validar tu sesión. Vuelve a iniciar sesión.");

  let user = await prisma.user.findFirst({
    where: { OR: [{ authId: identity.authId }, { email: identity.email }] },
    include: { memberships: { where: { active: true }, orderBy: { createdAt: "asc" } } },
  });
  // Primer ingreso de alguien dado de alta por email (p. ej. un empleado invitado): se vincula
  if (user && user.authId !== identity.authId) {
    await prisma.user.update({ where: { id: user.id }, data: { authId: identity.authId, email: identity.email } });
  }

  const membership = user?.memberships.find((m) => m.role === "OWNER") ?? user?.memberships[0];
  if (user && membership) {
    res.clearCookie(SIGNUP_COOKIE);
    setSessionCookie(res, { sub: user.id, bid: membership.businessId });
    res.json({ status: "authenticated" });
    return;
  }

  setSignupCookie(res, { kind: "signup", email: identity.email, authId: identity.authId });
  res.json({ status: "onboarding", email: identity.email });
});

const signupSchema = z.object({
  businessName: reqStr(100),
  country: z.enum(COUNTRY_CODES),
  type: z.enum(["CELULARES", "GASTRONOMICO", "COMERCIO", "SERVICIOS", "MERCADOS", "OTRO"]),
  ownerName: reqStr(100),
  phone: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\+?\d{7,15}$/, "Número no válido").nullish()),
});

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "negocio";

router.post("/signup", async (req, res) => {
  const claims = readSignupClaims(req.cookies?.[SIGNUP_COOKIE]);
  if (!claims) throw unauthorized("Inicia sesión con tu email para continuar.");
  const data = signupSchema.parse(req.body);
  const country = countryByCode(data.country)!;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({ where: { OR: [{ authId: claims.authId }, { email: claims.email }] } });
    const user = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { authId: claims.authId, email: claims.email } })
      : await tx.user.create({
          data: { authId: claims.authId, email: claims.email, name: data.ownerName, phone: data.phone ?? null },
        });
    const business = await tx.business.create({
      data: {
        name: data.businessName,
        type: data.type,
        country: country.code,
        currency: country.currency,
        timezone: country.timezone,
        ownerName: data.ownerName,
        slug: `${slugify(data.businessName)}-${randomBytes(3).toString("hex")}`,
        phone: data.phone ?? null,
        email: claims.email,
      },
    });
    await tx.membership.create({ data: { userId: user.id, businessId: business.id, role: "OWNER" } });
    return { user, business };
  });

  res.clearCookie(SIGNUP_COOKIE);
  setSessionCookie(res, { sub: result.user.id, bid: result.business.id });
  res.status(201).json({ status: "authenticated" });
});

router.post("/logout", (_req, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const a = ctx(req);
  const [user, business, memberships] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { id: true, name: true, phone: true, email: true } }),
    prisma.business.findUniqueOrThrow({ where: { id: a.businessId } }),
    prisma.membership.findMany({
      where: { userId: a.userId, active: true },
      select: { businessId: true, role: true, business: { select: { name: true } } },
    }),
  ]);
  const country = countryByCode(business.country);
  res.json({
    user,
    role: a.role,
    permissions: a.permissions,
    business: {
      id: business.id,
      name: business.name,
      type: business.type,
      country: business.country,
      currency: business.currency,
      currencySymbol: country?.symbol ?? business.currency,
      timezone: business.timezone,
      plan: business.plan,
      slug: business.slug,
      logoUrl: imageUrl(business.logoKey, 160),
    },
    businesses: memberships.map((m) => ({ id: m.businessId, name: m.business.name, role: m.role })),
  });
});

router.post("/switch", requireAuth, async (req, res) => {
  const { businessId } = z.object({ businessId: z.string() }).parse(req.body);
  const a = ctx(req);
  const m = await prisma.membership.findUnique({ where: { userId_businessId: { userId: a.userId, businessId } } });
  if (!m || !m.active) throw unauthorized("No tienes acceso a ese negocio.");
  setSessionCookie(res, { sub: a.userId, bid: businessId });
  res.json({ ok: true });
});

// Para que el frontend sepa si hay un registro de negocio pendiente tras recargar la página
router.get("/signup-state", (req, res) => {
  const claims = readSignupClaims(req.cookies?.[SIGNUP_COOKIE]);
  res.json({ pending: Boolean(claims), email: claims?.email ?? null, hasSession: Boolean(req.cookies?.[SESSION_COOKIE]) });
});

export default router;

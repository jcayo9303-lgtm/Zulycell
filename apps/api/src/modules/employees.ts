import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { email, optPhone, optStr, reqStr } from "../lib/validate.js";
import { waLink } from "../lib/messaging.js";
import { config } from "../config.js";
import { PERMISSION_KEYS, normalizePermissions, type Permission } from "../lib/permissions.js";
import { ctx, forgetAuth, requireOwner } from "../middleware/auth.js";

const router = Router();
router.use(requireOwner);

const permissionsSchema = z
  .record(z.boolean())
  .default({})
  .transform((p) => normalizePermissions(p));

const createSchema = z.object({
  name: reqStr(100),
  // Con este email el empleado crea su contraseña en /registro
  email,
  phone: optPhone,
  position: optStr(100),
  permissions: permissionsSchema,
});

const updateSchema = z.object({
  position: optStr(100),
  permissions: permissionsSchema,
  active: z.boolean().optional(),
});

const toDto = (m: {
  id: string;
  userId: string;
  role: string;
  position: string | null;
  active: boolean;
  permissions: unknown;
  createdAt: Date;
  user: { name: string; phone: string | null; email: string | null };
}) => ({
  membershipId: m.id,
  userId: m.userId,
  name: m.user.name,
  phone: m.user.phone,
  email: m.user.email,
  position: m.position,
  role: m.role,
  active: m.active,
  permissions:
    m.role === "OWNER"
      ? Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]))
      : normalizePermissions(m.permissions),
  createdAt: m.createdAt,
});

router.get("/", async (req, res) => {
  const { businessId } = ctx(req);
  const members = await prisma.membership.findMany({
    where: { businessId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { name: true, phone: true, email: true } } },
  });
  res.json(members.map(toDto));
});

function inviteText(businessName: string, name: string, userEmail: string) {
  return `Hola ${name}, te invitamos a usar Zulycell en ${businessName}. Crea tu contraseña con el email ${userEmail} aquí: ${config.publicUrl}/login?registro=1`;
}

function inviteUrl(businessName: string, name: string, userEmail: string, phone: string | null) {
  return phone ? waLink(phone, inviteText(businessName, name, userEmail)) : null;
}

router.post("/", async (req, res) => {
  const { businessId } = ctx(req);
  const data = createSchema.parse(req.body);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { name: true } });

  const membership = await prisma.$transaction(async (tx) => {
    const user =
      (await tx.user.findUnique({ where: { email: data.email } })) ??
      (await tx.user.create({ data: { email: data.email, phone: data.phone ?? null, name: data.name } }));
    const existing = await tx.membership.findUnique({ where: { userId_businessId: { userId: user.id, businessId } } });
    if (existing?.active) throw conflict("Esta persona ya tiene acceso a tu negocio.");
    if (existing) {
      return tx.membership.update({
        where: { id: existing.id },
        data: { active: true, position: data.position ?? null, permissions: data.permissions },
        include: { user: { select: { name: true, phone: true, email: true } } },
      });
    }
    return tx.membership.create({
      data: { userId: user.id, businessId, role: "EMPLOYEE", position: data.position ?? null, permissions: data.permissions },
      include: { user: { select: { name: true, phone: true, email: true } } },
    });
  });

  res.status(201).json({
    ...toDto(membership),
    inviteUrl: inviteUrl(business.name, data.name, data.email, data.phone ?? null),
    inviteText: inviteText(business.name, data.name, data.email),
  });
});

async function findEmployee(businessId: string, membershipId: string) {
  const m = await prisma.membership.findFirst({ where: { id: membershipId, businessId } });
  if (!m) throw notFound("El empleado no existe.");
  if (m.role === "OWNER") throw badRequest("No se pueden modificar los accesos del propietario.");
  return m;
}

router.put("/:membershipId", async (req, res) => {
  const { businessId } = ctx(req);
  const m = await findEmployee(businessId, req.params.membershipId);
  const data = updateSchema.parse(req.body);
  const updated = await prisma.membership.update({
    where: { id: m.id },
    data: {
      position: data.position ?? null,
      permissions: data.permissions as Record<Permission, boolean>,
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
    include: { user: { select: { name: true, phone: true, email: true } } },
  });
  forgetAuth(businessId, m.userId);
  res.json(toDto(updated));
});

router.get("/:membershipId/invite", async (req, res) => {
  const { businessId } = ctx(req);
  const m = await findEmployee(businessId, req.params.membershipId);
  const [user, business] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: m.userId } }),
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { name: true } }),
  ]);
  if (!user.email) throw badRequest("El empleado no tiene email registrado.");
  res.json({ url: inviteUrl(business.name, user.name, user.email, user.phone), text: inviteText(business.name, user.name, user.email) });
});

router.delete("/:membershipId", async (req, res) => {
  const { businessId } = ctx(req);
  const m = await findEmployee(businessId, req.params.membershipId);
  await prisma.membership.update({ where: { id: m.id }, data: { active: false } });
  forgetAuth(businessId, m.userId);
  res.json({ ok: true });
});

export default router;

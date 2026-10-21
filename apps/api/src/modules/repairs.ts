import { Router } from "express";
import { z } from "zod";
import type { Prisma, RepairStatus } from "@prisma/client";
import { prisma, type Tx } from "../lib/prisma.js";
import { badRequest, notFound } from "../lib/errors.js";
import { id, listQuery, money, optId, optPhone, optStr, paymentMethod, qty, reqStr, dateStr } from "../lib/validate.js";
import { round2 } from "../lib/money.js";
import { dayRangeUtc, todayYmd } from "../lib/dates.js";
import { waLink } from "../lib/messaging.js";
import { imageUrl } from "../lib/storage.js";
import { countryByCode } from "../lib/countries.js";
import { sendXlsx } from "../lib/xlsx.js";
import { moveStock } from "../services/inventory.js";
import { nextNumber } from "../services/numbering.js";
import { ctx, requirePerm } from "../middleware/auth.js";

const router = Router();
const canView = requirePerm("repairs_view", "repairs_edit");
const canEdit = requirePerm("repairs_edit");

const STATUSES = [
  "RECEIVED",
  "DIAGNOSING",
  "WAITING_PARTS",
  "REPAIRING",
  "READY",
  "DELIVERED",
  "UNREPAIRABLE",
  "CANCELLED",
] as const;

const STATUS_LABEL: Record<RepairStatus, string> = {
  RECEIVED: "Recibido",
  DIAGNOSING: "En diagnóstico",
  WAITING_PARTS: "Esperando repuesto",
  REPAIRING: "En reparación",
  READY: "Listo para entregar",
  DELIVERED: "Entregado",
  UNREPAIRABLE: "Sin reparación",
  CANCELLED: "Cancelado",
};

const OPEN: RepairStatus[] = ["RECEIVED", "DIAGNOSING", "WAITING_PARTS", "REPAIRING"];

/** Flujo de estados permitido */
const TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  RECEIVED: ["DIAGNOSING", "WAITING_PARTS", "REPAIRING", "READY", "UNREPAIRABLE", "CANCELLED"],
  DIAGNOSING: ["RECEIVED", "WAITING_PARTS", "REPAIRING", "READY", "UNREPAIRABLE", "CANCELLED"],
  WAITING_PARTS: ["DIAGNOSING", "REPAIRING", "UNREPAIRABLE", "CANCELLED"],
  REPAIRING: ["WAITING_PARTS", "READY", "UNREPAIRABLE", "CANCELLED"],
  READY: ["REPAIRING", "DELIVERED"],
  UNREPAIRABLE: ["DELIVERED", "DIAGNOSING"],
  DELIVERED: [],
  CANCELLED: [],
};

const optDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.date().nullable());

const repairFields = {
  deviceType: reqStr(30),
  brand: reqStr(60),
  model: reqStr(80),
  imei: z.preprocess((v) => (typeof v === "string" ? v.replace(/\s/g, "") : v), optStr(30)),
  color: optStr(30),
  accessCode: optStr(60),
  accessories: optStr(255),
  reportedIssue: reqStr(500),
  physicalCondition: optStr(500),
  estimatedCost: money(0).default(0),
  promisedAt: optDate.optional(),
  warrantyDays: z.coerce.number().int().min(0).max(3650).default(30),
  technicianId: optId,
  notes: optStr(500),
};

const createSchema = z
  .object({
    ...repairFields,
    clientId: optId,
    client: z.object({ name: reqStr(100), phone: optPhone }).nullish(),
    advance: z.object({ amount: money(0.01), method: paymentMethod.exclude(["CREDIT"]) }).nullish(),
  })
  .refine((v) => v.clientId || v.client, { message: "Selecciona o crea el cliente", path: ["clientId"] });

const updateSchema = z.object({
  ...repairFields,
  clientId: id.optional(),
  diagnosis: optStr(1000),
  laborCost: money(0).default(0),
});

const paymentSchema = z.object({
  amount: money(0.01),
  method: paymentMethod.exclude(["CREDIT"]),
  notes: optStr(255),
});

const statusSchema = z.object({
  status: z.enum(STATUSES),
  note: optStr(200),
  payment: z.object({ amount: money(0.01), method: paymentMethod.exclude(["CREDIT"]) }).nullish(),
});

const partSchema = z
  .object({
    productId: optId,
    variantId: optId,
    name: optStr(160),
    quantity: qty(0.001, 99_999),
    unitPrice: money(0).nullish(),
  })
  .refine((v) => v.productId || v.name, { message: "Elige un producto o escribe el repuesto", path: ["name"] });

const listSchema = listQuery.extend({
  status: z.string().optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  technicianId: z.string().optional(),
});

const balanceOf = (r: { total: Prisma.Decimal; paid: Prisma.Decimal }) => round2(r.total.toNumber() - r.paid.toNumber());

async function findRepair(businessId: string, repairId: string, tx: Tx = prisma) {
  const repair = await tx.repairOrder.findFirst({ where: { id: repairId, businessId } });
  if (!repair) throw notFound("La orden de reparación no existe.");
  return repair;
}

function assertEditable(status: RepairStatus) {
  if (status === "DELIVERED" || status === "CANCELLED") throw badRequest("La orden ya está cerrada.");
}

async function assertTechnician(businessId: string, technicianId: string | null | undefined) {
  if (!technicianId) return;
  const m = await prisma.membership.findUnique({ where: { userId_businessId: { userId: technicianId, businessId } } });
  if (!m || !m.active) throw badRequest("El técnico no pertenece al negocio.", { technicianId: "Técnico no válido" });
}

/** Recalcula repuestos y total (mano de obra + repuestos) */
async function recalc(tx: Tx, repairId: string) {
  const agg = await tx.repairPart.aggregate({ where: { repairId }, _sum: { subtotal: true } });
  const repair = await tx.repairOrder.findUniqueOrThrow({ where: { id: repairId }, select: { laborCost: true } });
  const partsTotal = agg._sum.subtotal?.toNumber() ?? 0;
  return tx.repairOrder.update({
    where: { id: repairId },
    data: { partsTotal, total: round2(repair.laborCost.toNumber() + partsTotal) },
  });
}

async function addPayment(
  tx: Tx,
  ctxv: { businessId: string; userId: string },
  repairId: string,
  p: { amount: number; method: z.infer<typeof paymentMethod>; notes?: string | null },
) {
  const repair = await tx.repairOrder.findUniqueOrThrow({ where: { id: repairId } });
  const balance = balanceOf(repair);
  if (p.amount > balance + 0.001) {
    throw badRequest(`El pago supera el saldo pendiente (${balance.toFixed(2)}).`, { amount: "Mayor que el saldo" });
  }
  await tx.repairPayment.create({
    data: { businessId: ctxv.businessId, repairId, amount: p.amount, method: p.method, notes: p.notes ?? null, userId: ctxv.userId },
  });
  return tx.repairOrder.update({ where: { id: repairId }, data: { paid: { increment: p.amount } } });
}

/** Devuelve al stock todos los repuestos de inventario y los quita de la orden */
async function returnAllParts(tx: Tx, ctxv: { businessId: string; userId: string }, repairId: string, number: number) {
  const parts = await tx.repairPart.findMany({ where: { repairId } });
  for (const part of parts) {
    if (part.productId) {
      await moveStock(tx, {
        businessId: ctxv.businessId,
        productId: part.productId,
        variantId: part.variantId,
        quantity: part.quantity.toNumber(),
        type: "REPAIR_RETURN",
        reason: `Reparación #${number}`,
        refId: repairId,
        userId: ctxv.userId,
      });
    }
  }
  await tx.repairPart.deleteMany({ where: { repairId } });
}

async function buildWhere(businessId: string, query: z.infer<typeof listSchema>) {
  const where: Prisma.RepairOrderWhereInput = { businessId };
  if (query.status) {
    const list = query.status.split(",").filter((s): s is RepairStatus => (STATUSES as readonly string[]).includes(s));
    if (list.length) where.status = { in: list };
  }
  if (query.technicianId) where.technicianId = query.technicianId;
  if (query.from || query.to) {
    const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });
    const today = todayYmd(b.timezone);
    where.createdAt = dayRangeUtc(b.timezone, query.from ?? "2000-01-01", query.to ?? today);
  }
  if (query.q) {
    const q = query.q.replace(/^#/, "");
    const n = Number(q);
    where.OR = [
      ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []),
      { client: { name: { contains: q, mode: "insensitive" } } },
      { client: { phone: { contains: q } } },
      { brand: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
      { imei: { contains: q } },
    ];
  }
  return where;
}

async function technicianNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!unique.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

const listSelect = {
  id: true,
  number: true,
  status: true,
  deviceType: true,
  brand: true,
  model: true,
  imei: true,
  color: true,
  reportedIssue: true,
  technicianId: true,
  estimatedCost: true,
  laborCost: true,
  partsTotal: true,
  total: true,
  paid: true,
  promisedAt: true,
  deliveredAt: true,
  createdAt: true,
  client: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.RepairOrderSelect;

// ── Listado ───────────────────────────────────────────────────────────

router.get("/", canView, async (req, res) => {
  const { businessId } = ctx(req);
  const query = listSchema.parse(req.query);
  const where = await buildWhere(businessId, query);

  const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });
  const monthStart = dayRangeUtc(b.timezone, `${todayYmd(b.timezone).slice(0, 7)}-01`, todayYmd(b.timezone)).gte;

  const [items, total, groups, deliveredMonth, pending] = await Promise.all([
    prisma.repairOrder.findMany({
      where,
      select: listSelect,
      orderBy: { number: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.repairOrder.count({ where }),
    prisma.repairOrder.groupBy({ by: ["status"], where: { businessId }, _count: { _all: true } }),
    prisma.repairOrder.count({ where: { businessId, status: "DELIVERED", deliveredAt: { gte: monthStart } } }),
    prisma.repairOrder.aggregate({
      where: { businessId, status: { notIn: ["CANCELLED"] } },
      _sum: { total: true, paid: true },
    }),
  ]);

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<RepairStatus, number>;
  for (const g of groups) counts[g.status] = g._count._all;
  const names = await technicianNames(items.map((i) => i.technicianId));

  res.json({
    items: items.map((r) => ({ ...r, balance: balanceOf(r), technicianName: r.technicianId ? names.get(r.technicianId) ?? null : null })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    counts,
    stats: {
      inShop: OPEN.reduce((a, s) => a + counts[s], 0),
      ready: counts.READY,
      deliveredMonth,
      receivable: Math.max(0, round2((pending._sum.total?.toNumber() ?? 0) - (pending._sum.paid?.toNumber() ?? 0))),
    },
  });
});

router.get("/export.xlsx", canView, async (req, res) => {
  const { businessId } = ctx(req);
  const query = listSchema.parse(req.query);
  const where = await buildWhere(businessId, query);
  const rows = await prisma.repairOrder.findMany({ where, select: listSelect, orderBy: { number: "desc" }, take: 10_000 });
  const names = await technicianNames(rows.map((r) => r.technicianId));

  await sendXlsx(res, `reparaciones-${new Date().toISOString().slice(0, 10)}`, [
    {
      name: "Reparaciones",
      columns: [
        { header: "N.º", key: "number", width: 8, format: "int" },
        { header: "Fecha", key: "createdAt", width: 17, format: "datetime" },
        { header: "Cliente", key: "client", width: 26 },
        { header: "Teléfono", key: "phone", width: 14 },
        { header: "Equipo", key: "deviceType", width: 12 },
        { header: "Marca", key: "brand", width: 14 },
        { header: "Modelo", key: "model", width: 18 },
        { header: "IMEI / serie", key: "imei", width: 18 },
        { header: "Falla reportada", key: "reportedIssue", width: 36 },
        { header: "Estado", key: "status", width: 18 },
        { header: "Técnico", key: "technician", width: 18 },
        { header: "Mano de obra", key: "laborCost", width: 13, format: "money" },
        { header: "Repuestos", key: "partsTotal", width: 13, format: "money" },
        { header: "Total", key: "total", width: 13, format: "money" },
        { header: "Pagado", key: "paid", width: 13, format: "money" },
        { header: "Saldo", key: "balance", width: 13, format: "money" },
        { header: "Prometido", key: "promisedAt", width: 17, format: "datetime" },
        { header: "Entregado", key: "deliveredAt", width: 17, format: "datetime" },
      ],
      rows: rows.map((r) => ({
        number: r.number,
        createdAt: r.createdAt,
        client: r.client.name,
        phone: r.client.phone ?? "",
        deviceType: r.deviceType,
        brand: r.brand,
        model: r.model,
        imei: r.imei ?? "",
        reportedIssue: r.reportedIssue,
        status: STATUS_LABEL[r.status],
        technician: r.technicianId ? names.get(r.technicianId) ?? "" : "",
        laborCost: r.laborCost.toNumber(),
        partsTotal: r.partsTotal.toNumber(),
        total: r.total.toNumber(),
        paid: r.paid.toNumber(),
        balance: balanceOf(r),
        promisedAt: r.promisedAt,
        deliveredAt: r.deliveredAt,
      })),
      totals: ["laborCost", "partsTotal", "total", "paid", "balance"],
    },
  ]);
});

// ── Detalle ───────────────────────────────────────────────────────────

router.get("/:id", canView, async (req, res) => {
  const { businessId } = ctx(req);
  const repair = await prisma.repairOrder.findFirst({
    where: { id: String(req.params.id), businessId },
    include: {
      client: { select: { id: true, name: true, phone: true, document: true, email: true } },
      parts: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!repair) throw notFound("La orden de reparación no existe.");
  const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const names = await technicianNames([repair.technicianId, repair.userId]);
  const country = countryByCode(b.country);

  res.json({
    ...repair,
    balance: balanceOf(repair),
    technicianName: repair.technicianId ? names.get(repair.technicianId) ?? null : null,
    receivedByName: repair.userId ? names.get(repair.userId) ?? null : null,
    allowedStatuses: TRANSITIONS[repair.status],
    business: {
      name: b.name,
      logoUrl: b.receiptShowLogo ? imageUrl(b.logoKey, 240) : null,
      address: b.address,
      phone: b.phone,
      email: b.email,
      taxId: b.taxId,
      repairTerms: b.repairTerms,
      currency: b.currency,
      currencySymbol: country?.symbol ?? b.currency,
      timezone: b.timezone,
    },
  });
});

// ── Alta y edición ────────────────────────────────────────────────────

router.post("/", canEdit, async (req, res) => {
  const a = ctx(req);
  const data = createSchema.parse(req.body);
  await assertTechnician(a.businessId, data.technicianId);

  const repair = await prisma.$transaction(async (tx) => {
    let clientId = data.clientId ?? null;
    if (clientId) {
      const client = await tx.client.findFirst({ where: { id: clientId, businessId: a.businessId, deletedAt: null } });
      if (!client) throw badRequest("El cliente no existe.", { clientId: "Cliente no válido" });
    } else if (data.client) {
      clientId = (await tx.client.create({ data: { businessId: a.businessId, name: data.client.name, phone: data.client.phone ?? null } })).id;
    }

    const number = await nextNumber(tx, a.businessId, "nextRepairNumber");
    const created = await tx.repairOrder.create({
      data: {
        businessId: a.businessId,
        number,
        clientId: clientId!,
        deviceType: data.deviceType,
        brand: data.brand,
        model: data.model,
        imei: data.imei ?? null,
        color: data.color ?? null,
        accessCode: data.accessCode ?? null,
        accessories: data.accessories ?? null,
        reportedIssue: data.reportedIssue,
        physicalCondition: data.physicalCondition ?? null,
        estimatedCost: data.estimatedCost,
        // El costo estimado sirve como mano de obra inicial; se ajusta en el diagnóstico
        laborCost: data.estimatedCost,
        total: data.estimatedCost,
        promisedAt: data.promisedAt ?? null,
        warrantyDays: data.warrantyDays,
        technicianId: data.technicianId ?? null,
        notes: data.notes ?? null,
        userId: a.userId,
      },
    });
    if (data.advance) {
      if (data.advance.amount > data.estimatedCost && data.estimatedCost > 0) {
        throw badRequest("El adelanto no puede superar el costo estimado.", { "advance.amount": "Mayor que el estimado" });
      }
      await tx.repairPayment.create({
        data: {
          businessId: a.businessId,
          repairId: created.id,
          amount: data.advance.amount,
          method: data.advance.method,
          notes: "Adelanto al recibir",
          userId: a.userId,
        },
      });
      // Si no hay estimado, el adelanto fija el total mínimo para no quedar con saldo negativo
      const total = Math.max(created.total.toNumber(), data.advance.amount);
      return tx.repairOrder.update({
        where: { id: created.id },
        data: { paid: data.advance.amount, total, laborCost: total },
      });
    }
    return created;
  });

  res.status(201).json(repair);
});

router.put("/:id", canEdit, async (req, res) => {
  const a = ctx(req);
  const data = updateSchema.parse(req.body);
  const existing = await findRepair(a.businessId, String(req.params.id));
  assertEditable(existing.status);
  await assertTechnician(a.businessId, data.technicianId);
  if (data.clientId) {
    const client = await prisma.client.findFirst({ where: { id: data.clientId, businessId: a.businessId, deletedAt: null } });
    if (!client) throw badRequest("El cliente no existe.", { clientId: "Cliente no válido" });
  }

  const repair = await prisma.$transaction(async (tx) => {
    const updatedTotal = round2(data.laborCost + existing.partsTotal.toNumber());
    if (updatedTotal + 0.001 < existing.paid.toNumber()) {
      throw badRequest("El total no puede quedar por debajo de lo ya pagado.", { laborCost: "Total menor a lo pagado" });
    }
    await tx.repairOrder.update({
      where: { id: existing.id },
      data: {
        ...(data.clientId ? { clientId: data.clientId } : {}),
        deviceType: data.deviceType,
        brand: data.brand,
        model: data.model,
        imei: data.imei ?? null,
        color: data.color ?? null,
        accessCode: data.accessCode ?? null,
        accessories: data.accessories ?? null,
        reportedIssue: data.reportedIssue,
        physicalCondition: data.physicalCondition ?? null,
        diagnosis: data.diagnosis ?? null,
        estimatedCost: data.estimatedCost,
        laborCost: data.laborCost,
        promisedAt: data.promisedAt ?? null,
        warrantyDays: data.warrantyDays,
        technicianId: data.technicianId ?? null,
        notes: data.notes ?? null,
      },
    });
    return recalc(tx, existing.id);
  });
  res.json(repair);
});

// ── Estados ───────────────────────────────────────────────────────────

router.post("/:id/status", canEdit, async (req, res) => {
  const a = ctx(req);
  const { status, note, payment } = statusSchema.parse(req.body);
  const existing = await findRepair(a.businessId, String(req.params.id));
  if (!TRANSITIONS[existing.status].includes(status)) {
    throw badRequest(`No se puede pasar de "${STATUS_LABEL[existing.status]}" a "${STATUS_LABEL[status]}".`);
  }

  const repair = await prisma.$transaction(async (tx) => {
    if (status === "CANCELLED" || status === "UNREPAIRABLE") {
      await returnAllParts(tx, a, existing.id, existing.number);
      await recalc(tx, existing.id);
    }
    if (status === "DELIVERED") {
      if (payment) await addPayment(tx, a, existing.id, payment);
      const current = await tx.repairOrder.findUniqueOrThrow({ where: { id: existing.id } });
      const balance = balanceOf(current);
      if (balance > 0.001) {
        throw badRequest(`Hay un saldo pendiente de ${balance.toFixed(2)}. Cóbralo antes de entregar.`, { payment: "Saldo pendiente" });
      }
    }
    const notes = note
      ? [existing.notes, `${STATUS_LABEL[status]}: ${note}`].filter(Boolean).join("\n").slice(-500)
      : existing.notes;
    return tx.repairOrder.update({
      where: { id: existing.id },
      data: { status, notes, ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}) },
    });
  });
  res.json(repair);
});

// ── Repuestos ─────────────────────────────────────────────────────────

router.post("/:id/parts", canEdit, async (req, res) => {
  const a = ctx(req);
  const data = partSchema.parse(req.body);
  const existing = await findRepair(a.businessId, String(req.params.id));
  assertEditable(existing.status);
  if (existing.status === "UNREPAIRABLE") throw badRequest("La orden está marcada sin reparación.");

  const repair = await prisma.$transaction(async (tx) => {
    let name = data.name ?? "";
    let unitPrice = data.unitPrice ?? 0;
    let unitCost = 0;

    if (data.productId) {
      const product = await tx.product.findFirst({
        where: { id: data.productId, businessId: a.businessId, deletedAt: null },
        include: { variants: { where: { deletedAt: null } } },
      });
      if (!product) throw badRequest("El producto no existe.");
      const variant = data.variantId ? product.variants.find((v) => v.id === data.variantId) : null;
      if (data.variantId && !variant) throw badRequest("La variante no existe.");
      if (product.unit === "UNIT" && !Number.isInteger(data.quantity)) throw badRequest("La cantidad debe ser un número entero.");
      name = variant ? `${product.name} · ${variant.value}` : product.name;
      unitPrice = data.unitPrice ?? (variant?.price ?? product.price).toNumber();
      unitCost = (variant?.cost ?? product.cost).toNumber();
      await moveStock(tx, {
        businessId: a.businessId,
        productId: product.id,
        variantId: variant?.id ?? null,
        quantity: -data.quantity,
        type: "REPAIR",
        reason: `Reparación #${existing.number}`,
        refId: existing.id,
        userId: a.userId,
      });
    }

    await tx.repairPart.create({
      data: {
        repairId: existing.id,
        productId: data.productId ?? null,
        variantId: data.variantId ?? null,
        name,
        quantity: data.quantity,
        unitPrice,
        unitCost,
        subtotal: round2(data.quantity * unitPrice),
      },
    });
    return recalc(tx, existing.id);
  });
  res.status(201).json(repair);
});

router.delete("/:id/parts/:partId", canEdit, async (req, res) => {
  const a = ctx(req);
  const existing = await findRepair(a.businessId, String(req.params.id));
  assertEditable(existing.status);
  const part = await prisma.repairPart.findFirst({ where: { id: String(req.params.partId), repairId: existing.id } });
  if (!part) throw notFound("El repuesto no existe.");

  const repair = await prisma.$transaction(async (tx) => {
    if (part.productId) {
      await moveStock(tx, {
        businessId: a.businessId,
        productId: part.productId,
        variantId: part.variantId,
        quantity: part.quantity.toNumber(),
        type: "REPAIR_RETURN",
        reason: `Reparación #${existing.number}`,
        refId: existing.id,
        userId: a.userId,
      });
    }
    await tx.repairPart.delete({ where: { id: part.id } });
    const updated = await recalc(tx, existing.id);
    if (updated.total.toNumber() + 0.001 < updated.paid.toNumber()) {
      throw badRequest("Quitar el repuesto dejaría el total por debajo de lo ya pagado.");
    }
    return updated;
  });
  res.json(repair);
});

// ── Pagos ─────────────────────────────────────────────────────────────

router.post("/:id/payments", canEdit, async (req, res) => {
  const a = ctx(req);
  const data = paymentSchema.parse(req.body);
  const existing = await findRepair(a.businessId, String(req.params.id));
  if (existing.status === "CANCELLED") throw badRequest("La orden está cancelada.");
  const repair = await prisma.$transaction((tx) => addPayment(tx, a, existing.id, data));
  res.status(201).json(repair);
});

// ── Aviso por WhatsApp ────────────────────────────────────────────────

router.get("/:id/notify", canView, async (req, res) => {
  const { businessId } = ctx(req);
  const repair = await prisma.repairOrder.findFirst({
    where: { id: String(req.params.id), businessId },
    include: { client: { select: { name: true, phone: true } }, business: { select: { name: true, country: true, currency: true } } },
  });
  if (!repair) throw notFound("La orden de reparación no existe.");
  if (!repair.client.phone) throw badRequest("El cliente no tiene celular registrado.");

  const symbol = countryByCode(repair.business.country)?.symbol ?? repair.business.currency;
  const device = `${repair.brand} ${repair.model}`;
  const balance = balanceOf(repair);
  const order = `orden N.º ${String(repair.number).padStart(6, "0")}`;
  const hello = `Hola ${repair.client.name}, te saluda ${repair.business.name}.`;

  let text: string;
  switch (repair.status) {
    case "READY":
      text = `${hello} Tu ${device} (${order}) ya está listo para retirar.${balance > 0 ? ` Saldo a pagar: ${symbol} ${balance.toFixed(2)}.` : ""}`;
      break;
    case "DELIVERED":
      text = `${hello} Gracias por confiar en nosotros. Entregamos tu ${device} (${order}) con ${repair.warrantyDays} días de garantía.`;
      break;
    case "UNREPAIRABLE":
      text = `${hello} Lamentablemente tu ${device} (${order}) no tiene reparación. Puedes pasar a retirarlo.`;
      break;
    case "WAITING_PARTS":
      text = `${hello} Tu ${device} (${order}) está esperando un repuesto. Te avisaremos cuando esté listo.`;
      break;
    default:
      text = `${hello} Recibimos tu ${device} con la ${order}. Estado: ${STATUS_LABEL[repair.status]}.`;
  }

  // Formato internacional: si el número es local se antepone el código del país del negocio
  const PREFIX: Record<string, string> = { BO: "591", CO: "57", MX: "52", PE: "51", CL: "56", AR: "54", EC: "593" };
  const digits = repair.client.phone.replace(/\D/g, "");
  const phone = repair.client.phone.startsWith("+") || digits.length > 10 ? digits : `${PREFIX[repair.business.country] ?? ""}${digits}`;
  res.json({ url: waLink(phone, text), text });
});

export default router;

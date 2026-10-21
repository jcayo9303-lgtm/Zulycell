import type { Tx } from "../lib/prisma.js";
import { badRequest, conflict } from "../lib/errors.js";

// IMEI / números de serie de productos controlados unidad por unidad (celulares, tablets).

const SERIAL_RE = /^[A-Za-z0-9-]{4,30}$/;

/** Limpia espacios, quita vacíos y valida formato y duplicados dentro de la lista. */
export function normalizeSerials(list: string[]): string[] {
  const out = list.map((s) => s.replace(/\s+/g, "").toUpperCase()).filter(Boolean);
  const bad = out.find((s) => !SERIAL_RE.test(s));
  if (bad) throw badRequest(`"${bad}" no es un IMEI o número de serie válido (4 a 30 letras, números o guiones).`);
  const seen = new Set<string>();
  for (const s of out) {
    if (seen.has(s)) throw badRequest(`El IMEI ${s} está repetido en la lista.`);
    seen.add(s);
  }
  return out;
}

type RegisterInput = {
  businessId: string;
  productId: string;
  variantId?: string | null;
  serials: string[];
  purchaseId?: string | null;
  notes?: string | null;
};

/**
 * Da de alta series en stock. Un IMEI que ya existe del mismo producto y no está en stock
 * (vendido y devuelto, defectuoso reparado) vuelve a IN_STOCK; si es de otro producto o ya
 * está en stock, se rechaza. El movimiento de stock lo hace quien llama.
 */
export async function registerSerials(tx: Tx, input: RegisterInput) {
  const serials = normalizeSerials(input.serials);
  if (!serials.length) return [];
  const existing = await tx.productSerial.findMany({
    where: { businessId: input.businessId, serial: { in: serials } },
    include: { product: { select: { name: true } } },
  });
  for (const e of existing) {
    if (e.status === "IN_STOCK") throw conflict(`El IMEI ${e.serial} ya está en stock (${e.product.name}).`);
    if (e.productId !== input.productId) throw conflict(`El IMEI ${e.serial} pertenece a otro producto (${e.product.name}).`);
  }
  const reuse = new Set(existing.map((e) => e.serial));
  if (existing.length) {
    await tx.productSerial.updateMany({
      where: { businessId: input.businessId, serial: { in: [...reuse] } },
      data: {
        status: "IN_STOCK",
        variantId: input.variantId ?? null,
        saleId: null,
        soldAt: null,
        purchaseId: input.purchaseId ?? null,
        notes: input.notes ?? null,
      },
    });
  }
  const fresh = serials.filter((s) => !reuse.has(s));
  if (fresh.length) {
    await tx.productSerial.createMany({
      data: fresh.map((serial) => ({
        businessId: input.businessId,
        productId: input.productId,
        variantId: input.variantId ?? null,
        serial,
        purchaseId: input.purchaseId ?? null,
        notes: input.notes ?? null,
      })),
    });
  }
  return serials;
}

/** Comprueba que las series estén en stock y sean del producto/variante indicados. */
export async function assertSerialsInStock(
  tx: Tx,
  input: { businessId: string; productId: string; variantId?: string | null; serials: string[]; productName: string },
) {
  const serials = normalizeSerials(input.serials);
  const rows = await tx.productSerial.findMany({ where: { businessId: input.businessId, serial: { in: serials } } });
  for (const s of serials) {
    const row = rows.find((r) => r.serial === s);
    if (!row || row.productId !== input.productId) throw badRequest(`El IMEI ${s} no corresponde a "${input.productName}".`);
    if (row.status !== "IN_STOCK") throw badRequest(`El IMEI ${s} no está disponible (ya fue vendido o dado de baja).`);
    if ((input.variantId ?? null) !== (row.variantId ?? null)) {
      throw badRequest(`El IMEI ${s} es de otra variante de "${input.productName}".`);
    }
  }
  return serials;
}

export async function markSerialsSold(tx: Tx, businessId: string, serials: string[], saleId: string) {
  if (!serials.length) return;
  const { count } = await tx.productSerial.updateMany({
    where: { businessId, serial: { in: serials }, status: "IN_STOCK" },
    data: { status: "SOLD", saleId, soldAt: new Date() },
  });
  // Otra venta simultánea pudo tomar el mismo IMEI
  if (count !== serials.length) throw conflict("Uno de los IMEI acaba de venderse en otra venta. Revisa el carrito.");
}

/** Al anular una venta los IMEI vuelven a estar disponibles. */
export async function releaseSaleSerials(tx: Tx, businessId: string, saleId: string) {
  await tx.productSerial.updateMany({
    where: { businessId, saleId, status: "SOLD" },
    data: { status: "IN_STOCK", saleId: null, soldAt: null },
  });
}

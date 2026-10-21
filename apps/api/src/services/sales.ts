import { z } from "zod";
import { prisma, type Tx } from "../lib/prisma.js";
import { badRequest } from "../lib/errors.js";
import { discountType, money, optId, optStr, paymentMethod, qty, id } from "../lib/validate.js";
import { lineSubtotal, round2, totals } from "../lib/money.js";
import { applySaleStock } from "./inventory.js";
import { nextNumber } from "./numbering.js";
import { assertSerialsInStock, markSerialsSold, releaseSaleSerials } from "./serials.js";
import { addDays, todayYmd } from "../lib/dates.js";

/** Formulario de venta (docs §3, hojas 1 y 2) */
export const saleItemSchema = z.object({
  productId: id,
  variantId: optId,
  quantity: qty(0.001, 99_999),
  unitPrice: money(0.01),
  discountType: discountType.nullish(),
  discountValue: money(0).nullish(),
  /** IMEI / series vendidos (obligatorio en productos serializados) */
  serials: z.array(z.string().trim().min(1).max(30)).max(500).optional(),
});

export const saleInputSchema = z
  .object({
    items: z.array(saleItemSchema).min(1, "Agrega al menos un producto"),
    discountType: discountType.nullish(),
    discountValue: money(0).nullish(),
    method: paymentMethod,
    received: money(0).nullish(),
    clientId: optId,
    notes: optStr(255),
    quoteId: optId,
  })
  .refine((v) => v.method !== "CREDIT" || Boolean(v.clientId), {
    message: "Selecciona el cliente para vender a crédito",
    path: ["clientId"],
  })
  .refine((v) => v.discountType !== "PERCENT" || (v.discountValue ?? 0) <= 100, {
    message: "El porcentaje no puede superar 100",
    path: ["discountValue"],
  });

export type SaleInput = z.infer<typeof saleInputSchema>;

/**
 * Registra una venta: correlativo, ítems, descuento de stock (incluye recetas),
 * IMEI vendidos, garantía por línea y, si es a crédito, la deuda del cliente.
 * Todo en una transacción.
 */
export async function createSale(ctx: { businessId: string; userId: string }, input: SaleInput, txArg?: Tx) {
  const run = async (tx: Tx) => {
    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, businessId: ctx.businessId, deletedAt: null },
      include: { variants: { where: { deletedAt: null } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const business = await tx.business.findUniqueOrThrow({ where: { id: ctx.businessId }, select: { timezone: true } });
    const today = todayYmd(business.timezone);

    const lines = input.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw badRequest("Uno de los productos ya no existe.");
      const variant = item.variantId ? product.variants.find((v) => v.id === item.variantId) : null;
      if (item.variantId && !variant) throw badRequest(`La variante de "${product.name}" ya no existe.`);
      if (product.unit === "UNIT" && !Number.isInteger(item.quantity)) {
        throw badRequest(`La cantidad de "${product.name}" debe ser un número entero.`);
      }
      const serials = item.serials ?? [];
      if (product.serialized) {
        if (!Number.isInteger(item.quantity)) throw badRequest(`La cantidad de "${product.name}" debe ser entera.`);
        if (serials.length !== item.quantity) {
          throw badRequest(`Selecciona ${item.quantity} IMEI para "${product.name}" (llevas ${serials.length}).`);
        }
      } else if (serials.length) {
        throw badRequest(`"${product.name}" no se controla por IMEI.`);
      }
      const unitCost = (variant?.cost ?? product.cost).toNumber();
      return {
        productId: product.id,
        variantId: variant?.id ?? null,
        name: variant ? `${product.name} · ${variant.value}` : product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost,
        discountType: item.discountType ?? null,
        discountValue: item.discountValue ?? 0,
        subtotal: lineSubtotal(item),
        serials,
        warrantyUntil: product.warrantyDays > 0 ? new Date(`${addDays(today, product.warrantyDays)}T00:00:00Z`) : null,
      };
    });

    // Un mismo IMEI no puede ir en dos líneas
    const allSerials: string[] = [];
    for (const line of lines) {
      if (!line.serials.length) continue;
      const product = byId.get(line.productId)!;
      line.serials = await assertSerialsInStock(tx, {
        businessId: ctx.businessId,
        productId: line.productId,
        variantId: line.variantId,
        serials: line.serials,
        productName: product.name,
      });
      allSerials.push(...line.serials);
    }
    if (new Set(allSerials).size !== allSerials.length) throw badRequest("Hay un IMEI repetido en el carrito.");

    const t = totals(lines, { type: input.discountType, value: input.discountValue });
    let received: number | null = null;
    let change: number | null = null;
    if (input.method === "CASH" && input.received != null) {
      if (input.received < t.total) throw badRequest("El monto recibido es menor al total.", { received: "Debe ser mayor o igual al total" });
      received = input.received;
      change = round2(input.received - t.total);
    }

    if (input.clientId) {
      const client = await tx.client.findFirst({ where: { id: input.clientId, businessId: ctx.businessId, deletedAt: null } });
      if (!client) throw badRequest("El cliente no existe.");
    }

    const number = await nextNumber(tx, ctx.businessId, "nextSaleNumber");
    const sale = await tx.sale.create({
      data: {
        businessId: ctx.businessId,
        number,
        clientId: input.clientId ?? null,
        userId: ctx.userId,
        subtotal: t.subtotal,
        discountType: input.discountType ?? null,
        discountValue: input.discountValue ?? 0,
        discountTotal: t.discountTotal,
        total: t.total,
        method: input.method,
        received,
        change,
        notes: input.notes ?? null,
        quoteId: input.quoteId ?? null,
        items: { create: lines },
      },
      include: { items: true },
    });

    await applySaleStock(tx, { businessId: ctx.businessId, userId: ctx.userId, refId: sale.id }, lines, -1);
    await markSerialsSold(tx, ctx.businessId, allSerials, sale.id);

    if (input.method === "CREDIT" && input.clientId) {
      await tx.clientMovement.create({
        data: {
          businessId: ctx.businessId,
          clientId: input.clientId,
          type: "DEBT",
          amount: t.total,
          description: `Venta a crédito #${number}`,
          saleId: sale.id,
          userId: ctx.userId,
        },
      });
    }
    return sale;
  };

  return txArg ? run(txArg) : prisma.$transaction(run);
}

/** Anula una venta: devuelve el stock y revierte la deuda si fue a crédito. */
export async function voidSale(ctx: { businessId: string; userId: string }, saleId: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, businessId: ctx.businessId },
      include: { items: true },
    });
    if (!sale) throw badRequest("La venta no existe.");
    if (sale.status === "VOIDED") throw badRequest("La venta ya está anulada.");

    await tx.sale.update({ where: { id: sale.id }, data: { status: "VOIDED" } });
    await applySaleStock(
      tx,
      { businessId: ctx.businessId, userId: ctx.userId, refId: sale.id },
      sale.items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity.toNumber() })),
      1,
    );
    await releaseSaleSerials(tx, ctx.businessId, sale.id);
    if (sale.method === "CREDIT" && sale.clientId) {
      await tx.clientMovement.create({
        data: {
          businessId: ctx.businessId,
          clientId: sale.clientId,
          type: "PAYMENT",
          amount: sale.total,
          description: `Anulación de venta #${sale.number}`,
          saleId: sale.id,
          userId: ctx.userId,
        },
      });
    }
    return { ok: true };
  });
}

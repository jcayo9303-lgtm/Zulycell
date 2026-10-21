import type { StockMovementType, Unit } from "@prisma/client";
import type { Tx } from "../lib/prisma.js";
import { Prisma } from "../lib/prisma.js";
import { badRequest } from "../lib/errors.js";
import { round3 } from "../lib/money.js";

type MoveInput = {
  businessId: string;
  productId: string;
  variantId?: string | null;
  /** Variación con signo. Para ADJUST_SET es el valor final. */
  quantity: number;
  type: StockMovementType;
  reason?: string | null;
  refId?: string | null;
  userId?: string | null;
};

const FACTORS: Partial<Record<Unit, { base: string; factor: number }>> = {
  KG: { base: "mass", factor: 1000 },
  G: { base: "mass", factor: 1 },
  L: { base: "volume", factor: 1000 },
  ML: { base: "volume", factor: 1 },
};

/** Convierte una cantidad de `from` a `to` (kg↔g, l↔ml). Lanza error si no son compatibles. */
export function convertUnit(quantity: number, from: Unit, to: Unit): number {
  if (from === to) return quantity;
  const a = FACTORS[from];
  const b = FACTORS[to];
  if (!a || !b || a.base !== b.base) throw badRequest(`No se puede convertir de ${from} a ${to}`);
  return round3((quantity * a.factor) / b.factor);
}

/**
 * Aplica un movimiento de stock dentro de una transacción y lo registra en el kardex.
 * Si el producto tiene variantes, el stock del producto es la suma de sus variantes.
 */
export async function moveStock(tx: Tx, input: MoveInput) {
  const product = await tx.product.findFirst({
    where: { id: input.productId, businessId: input.businessId },
    select: { id: true, name: true, trackStock: true, business: { select: { allowNegativeStock: true } } },
  });
  if (!product) throw badRequest("Producto no encontrado");
  if (!product.trackStock) return null;

  const isSet = input.type === "ADJUST_SET";
  let stockAfter: Prisma.Decimal;
  let delta: number;

  if (input.variantId) {
    const variant = await tx.productVariant.findFirst({
      where: { id: input.variantId, productId: product.id, deletedAt: null },
    });
    if (!variant) throw badRequest("Variante no encontrada");
    delta = isSet ? round3(input.quantity - variant.stock.toNumber()) : input.quantity;
    const updated = await tx.productVariant.update({
      where: { id: variant.id },
      data: { stock: { increment: delta } },
    });
    stockAfter = updated.stock;
    const sum = await tx.productVariant.aggregate({
      where: { productId: product.id, deletedAt: null },
      _sum: { stock: true },
    });
    await tx.product.update({ where: { id: product.id }, data: { stock: sum._sum.stock ?? 0 } });
  } else {
    const current = await tx.product.findUniqueOrThrow({ where: { id: product.id }, select: { stock: true } });
    delta = isSet ? round3(input.quantity - current.stock.toNumber()) : input.quantity;
    const updated = await tx.product.update({
      where: { id: product.id },
      data: { stock: { increment: delta } },
    });
    stockAfter = updated.stock;
  }

  if (stockAfter.isNegative() && !product.business.allowNegativeStock) {
    throw badRequest(`Stock insuficiente para "${product.name}".`);
  }

  return tx.stockMovement.create({
    data: {
      businessId: input.businessId,
      productId: product.id,
      variantId: input.variantId ?? null,
      type: input.type,
      quantity: delta,
      stockAfter,
      reason: input.reason ?? null,
      refId: input.refId ?? null,
      userId: input.userId ?? null,
    },
  });
}

type SoldLine = { productId?: string | null; variantId?: string | null; quantity: number };

/**
 * Descuenta (sign = -1) o devuelve (sign = +1) el stock de una venta.
 * Los productos receta descuentan sus insumos convertidos a la unidad del insumo.
 */
export async function applySaleStock(
  tx: Tx,
  ctx: { businessId: string; userId?: string | null; refId: string },
  lines: SoldLine[],
  sign: -1 | 1,
) {
  for (const line of lines) {
    if (!line.productId) continue;
    const product = await tx.product.findFirst({
      where: { id: line.productId, businessId: ctx.businessId },
      include: { ingredients: { include: { ingredient: { select: { id: true, unit: true } } } } },
    });
    if (!product) continue;

    if (product.isRecipe) {
      for (const ing of product.ingredients) {
        const perPortion = convertUnit(ing.quantity.toNumber(), ing.unit, ing.ingredient.unit);
        await moveStock(tx, {
          businessId: ctx.businessId,
          productId: ing.ingredient.id,
          quantity: round3(sign * perPortion * line.quantity),
          type: sign < 0 ? "RECIPE_SALE" : "SALE_VOID",
          reason: `Receta: ${product.name}`,
          refId: ctx.refId,
          userId: ctx.userId,
        });
      }
      continue;
    }

    await moveStock(tx, {
      businessId: ctx.businessId,
      productId: product.id,
      variantId: line.variantId,
      quantity: round3(sign * line.quantity),
      type: sign < 0 ? "SALE" : "SALE_VOID",
      refId: ctx.refId,
      userId: ctx.userId,
    });
  }
}

/** Costo de una receta: Σ (cantidad convertida × costo del insumo). */
export async function recipeCost(tx: Tx, recipeId: string): Promise<number> {
  const ingredients = await tx.recipeIngredient.findMany({
    where: { recipeId },
    include: { ingredient: { select: { unit: true, cost: true } } },
  });
  let total = 0;
  for (const ing of ingredients) {
    const q = convertUnit(ing.quantity.toNumber(), ing.unit, ing.ingredient.unit);
    total += q * ing.ingredient.cost.toNumber();
  }
  return Math.round(total * 100) / 100;
}

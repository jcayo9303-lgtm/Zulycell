import { round2 } from "@/lib/format";
import type { Unit } from "@/lib/labels";

// Mismas reglas que apps/api/src/lib/money.ts, para mostrar totales antes de confirmar.

export type DiscountType = "AMOUNT" | "PERCENT";

export type CartLine = {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  unit: Unit;
  quantity: string;
  unitPrice: string;
  discountType: DiscountType;
  discountValue: string;
  stock: number | null;
  /** Producto controlado por IMEI: la cantidad es la cantidad de IMEI elegidos */
  serialized: boolean;
  serials: string[];
};

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function discountAmount(base: number, type: DiscountType, value: string): number {
  const v = num(value);
  if (!v) return 0;
  const raw = type === "PERCENT" ? (base * Math.min(v, 100)) / 100 : v;
  return round2(Math.min(Math.max(raw, 0), base));
}

export function lineSubtotal(l: CartLine): number {
  const gross = round2(num(l.quantity) * num(l.unitPrice));
  return round2(gross - discountAmount(gross, l.discountType, l.discountValue));
}

export function cartTotals(lines: CartLine[], type: DiscountType, value: string) {
  const subtotal = round2(lines.reduce((acc, l) => acc + lineSubtotal(l), 0));
  const discountTotal = discountAmount(subtotal, type, value);
  return { subtotal, discountTotal, total: round2(subtotal - discountTotal) };
}

export function toPayloadItem(l: CartLine) {
  const dv = num(l.discountValue);
  return {
    productId: l.productId,
    variantId: l.variantId,
    quantity: num(l.quantity),
    unitPrice: num(l.unitPrice),
    discountType: dv > 0 ? l.discountType : null,
    discountValue: dv > 0 ? dv : null,
    ...(l.serialized ? { serials: l.serials } : {}),
  };
}

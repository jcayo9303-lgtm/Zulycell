// Cálculos de dinero en centavos enteros para evitar errores de coma flotante.

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export type Discount = { type?: "AMOUNT" | "PERCENT" | null; value?: number | null };

/** Monto de descuento sobre una base; nunca mayor que la base */
export function discountAmount(base: number, d: Discount): number {
  if (!d.type || !d.value) return 0;
  const raw = d.type === "PERCENT" ? (base * Math.min(d.value, 100)) / 100 : d.value;
  return round2(Math.min(Math.max(raw, 0), base));
}

export type LineInput = { quantity: number; unitPrice: number; discountType?: "AMOUNT" | "PERCENT" | null; discountValue?: number | null };

/** subtotal por ítem = cantidad × precio − descuento */
export function lineSubtotal(line: LineInput): number {
  const gross = round2(line.quantity * line.unitPrice);
  return round2(gross - discountAmount(gross, { type: line.discountType, value: line.discountValue }));
}

export function totals(lines: LineInput[], global: Discount) {
  const subtotal = round2(lines.reduce((acc, l) => acc + lineSubtotal(l), 0));
  const discountTotal = discountAmount(subtotal, global);
  return { subtotal, discountTotal, total: round2(subtotal - discountTotal) };
}

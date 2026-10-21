import type { Unit } from "@/lib/labels";

export type Variant = {
  id: string;
  type: string;
  value: string;
  price: number | null;
  cost: number | null;
  stock: number;
  barcode: string | null;
};

export type Product = {
  id: string;
  name: string;
  barcode: string | null;
  brand: string | null;
  compatibleWith: string | null;
  warrantyDays: number;
  serialized: boolean;
  categoryId: string | null;
  categoryName: string | null;
  imageUrl: string | null;
  imageKey: string | null;
  description: string | null;
  price: number;
  cost: number;
  margin: number | null;
  stock: number;
  lowStockAlert: number;
  unit: Unit;
  trackStock: boolean;
  isRecipe: boolean;
  visibleInCatalog: boolean;
  variants: Variant[];
};

export type Category = { id: string; name: string; productCount: number };

export const isLowStock = (p: Product) => p.trackStock && !p.isRecipe && p.stock <= p.lowStockAlert;

/** "" → null; texto → número */
export const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/** Unidades convertibles entre sí (igual que services/inventory.ts del API) */
export function compatibleUnits(unit: Unit): Unit[] {
  if (unit === "KG" || unit === "G") return ["KG", "G"];
  if (unit === "L" || unit === "ML") return ["L", "ML"];
  return [unit];
}

const FACTOR: Partial<Record<Unit, number>> = { KG: 1000, G: 1, L: 1000, ML: 1 };

export function convertUnit(q: number, from: Unit, to: Unit): number {
  if (from === to) return q;
  const a = FACTOR[from];
  const b = FACTOR[to];
  return a && b ? (q * a) / b : q;
}

/** IMEI / series escritos uno por línea (o separados por coma o espacio) */
export function parseSerials(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

export type SerialRow = {
  id: string;
  serial: string;
  status: "IN_STOCK" | "SOLD" | "RETURNED" | "DEFECTIVE";
  variantId: string | null;
  variant: string | null;
  saleId: string | null;
  soldAt: string | null;
  notes: string | null;
  createdAt: string;
};

export const SERIAL_STATUS: Record<SerialRow["status"], string> = {
  IN_STOCK: "En stock",
  SOLD: "Vendido",
  RETURNED: "Devuelto",
  DEFECTIVE: "Defectuoso / baja",
};

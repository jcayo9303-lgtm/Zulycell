import type { RequestHandler } from "express";
import { Prisma } from "@prisma/client";

/** Convierte Prisma.Decimal en number para que el frontend reciba números en JSON. */
export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

export const plainJson: RequestHandler = (_req, res, next) => {
  const original = res.json.bind(res);
  res.json = (body) => original(toPlain(body));
  next();
};

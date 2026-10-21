import { z } from "zod";

// Esquemas reutilizables según las convenciones de docs/zulycell-formularios-detalle.md

const MAX_MONEY = 9_999_999.99;

const toNumber = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v);

/** DEC de dinero: 2 decimales, rango [min, 9 999 999.99] */
export const money = (min = 0.01) =>
  z.preprocess(
    toNumber,
    z
      .number({ invalid_type_error: "Debe ser un número" })
      .min(min, `Debe ser mayor o igual a ${min}`)
      .max(MAX_MONEY, "Valor demasiado alto")
      .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Máximo 2 decimales"),
  );

/** Cantidad: hasta 3 decimales (kg, litros); entera si la unidad es UNIT */
export const qty = (min = 0.001, max = 999_999) =>
  z.preprocess(
    toNumber,
    z
      .number({ invalid_type_error: "Debe ser un número" })
      .min(min, `Debe ser mayor o igual a ${min}`)
      .max(max, `Debe ser menor o igual a ${max}`),
  );

export const str = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);
export const reqStr = (max: number) => str(max).min(1, "Este campo es obligatorio");
export const optStr = (max: number) =>
  z.preprocess((v) => (v === "" ? null : v), str(max).nullish());

export const phone = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[\s\-()]/g, "") : v),
  z.string().regex(/^\+?\d{7,15}$/, "El número que ingresaste no es válido"),
);
export const optPhone = z.preprocess((v) => (v === "" ? null : v), phone.nullish());
export const email = z.string().trim().toLowerCase().email("Ingresa un email válido").max(254);
export const optEmail = z.preprocess((v) => (v === "" ? null : v), email.nullish());

/** EAN-13 o UPC-A */
export const barcode = z.preprocess(
  (v) => (v === "" ? null : v),
  z
    .string()
    .regex(/^(\d{12}|\d{13})$/, "Debe ser EAN-13 (13 dígitos) o UPC-A (12 dígitos)")
    .nullish(),
);

export const id = z.string().min(1).max(40);
export const optId = z.preprocess((v) => (v === "" ? null : v), id.nullish());

export const paymentMethod = z.enum(["CASH", "CARD", "TRANSFER", "QR", "WALLET", "CREDIT"]);
export const discountType = z.enum(["AMOUNT", "PERCENT"]);
export const unit = z.enum(["UNIT", "KG", "G", "L", "ML", "M", "BOX"]);

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha YYYY-MM-DD");

/** Paginación estándar ?page=&pageSize=&q= */
export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

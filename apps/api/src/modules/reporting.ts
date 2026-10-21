import { badRequest } from "../lib/errors.js";
import { quickRange, todayYmd } from "../lib/dates.js";

// Utilidades compartidas por ventas, estadísticas, caja y gastos para reportes y exportaciones.

export const METHOD_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  QR: "QR",
  WALLET: "Billetera móvil",
  CREDIT: "Crédito",
};

export const EXPENSE_LABEL: Record<string, string> = {
  RENT: "Arriendo / alquiler",
  UTILITIES: "Servicios públicos",
  PAYROLL: "Nómina",
  MERCHANDISE: "Compra de mercancía",
  TRANSPORT: "Transporte",
  ADVERTISING: "Publicidad",
  OTHER: "Otros",
};

export const methodLabel = (m: string | null | undefined) => (m ? METHOD_LABEL[m] ?? m : "Sin especificar");

/** "YYYY-MM-DD" del instante `d` en la zona del negocio */
export const localDay = (tz: string, d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/**
 * Excel no maneja zonas horarias: devuelve un Date cuyos campos UTC son la hora local del negocio,
 * para que la celda muestre la hora que vio el usuario.
 */
export function excelDate(tz: string, d: Date | null | undefined): Date | null {
  if (!d) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)),
  );
}

export type Period = "today" | "week" | "month" | "year";

/** Rango de días locales a partir de period | from/to; por defecto el mes en curso. */
export function resolveDays(tz: string, f: { period?: Period; from?: string; to?: string }) {
  let { from, to } = f.period ? quickRange(tz, f.period) : { from: f.from, to: f.to };
  if (!from && !to) ({ from, to } = quickRange(tz, "month"));
  from ??= to!;
  to ??= todayYmd(tz);
  if (from > to) throw badRequest("La fecha inicial no puede ser mayor que la final.");
  return { from, to };
}

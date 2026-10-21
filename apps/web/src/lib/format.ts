// Formatos de presentación. Las cifras son tabulares por CSS (font-variant-numeric).

const ZERO_DECIMAL = new Set(["COP", "CLP", "PYG"]);

export function fmtMoney(value: number | null | undefined, currency = "BOB", symbol?: string): string {
  const n = Number(value ?? 0);
  const decimals = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const body = new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(n));
  return `${n < 0 ? "−" : ""}${symbol ?? currency} ${body}`;
}

export function fmtNumber(value: number | null | undefined, decimals = 0): string {
  return new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value ?? 0));
}

export const UNIT_SHORT: Record<string, string> = {
  UNIT: "und",
  KG: "kg",
  G: "g",
  L: "l",
  ML: "ml",
  M: "m",
  BOX: "caja",
};

/** Cantidad con unidad: enteros para unidades, hasta 3 decimales para kg/l */
export function fmtQty(value: number | null | undefined, unit = "UNIT"): string {
  const n = Number(value ?? 0);
  const decimals = Number.isInteger(n) ? 0 : 3;
  return `${new Intl.NumberFormat("es-BO", { maximumFractionDigits: decimals }).format(n)} ${UNIT_SHORT[unit] ?? ""}`.trim();
}

export function fmtDate(value: string | Date | null | undefined, timeZone?: string): string {
  if (!value) return "—";
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "short", year: "numeric", timeZone }).format(d);
}

export function fmtDateTime(value: string | Date | null | undefined, timeZone?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function fmtPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${fmtNumber(value, decimals)} %`;
}

/** Correlativo con ceros: 42 → 000042 */
export const fmtSeq = (n: number | null | undefined, width = 6) => (n == null ? "Borrador" : String(n).padStart(width, "0"));

/** "YYYY-MM-DD" local del navegador */
export function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

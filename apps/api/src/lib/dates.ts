// Rangos de fecha en la zona horaria del negocio (los timestamps se guardan en UTC).

function offsetMinutes(timeZone: string, at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** "YYYY-MM-DD" de hoy en la zona del negocio */
export function todayYmd(timeZone: string, at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Inicio (inclusive) del día local `ymd` expresado en UTC */
export function startOfDayUtc(timeZone: string, ymd: string): Date {
  const naive = new Date(`${ymd}T00:00:00Z`);
  return new Date(naive.getTime() - offsetMinutes(timeZone, naive) * 60_000);
}

/** Rango [desde, hasta) en UTC para días locales from..to (ambos inclusive) */
export function dayRangeUtc(timeZone: string, from: string, to: string): { gte: Date; lt: Date } {
  const end = new Date(`${to}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: startOfDayUtc(timeZone, from), lt: startOfDayUtc(timeZone, end.toISOString().slice(0, 10)) };
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Rangos rápidos (docs §19): hoy, esta semana (lunes), este mes, este año */
export function quickRange(timeZone: string, period: "today" | "week" | "month" | "year"): { from: string; to: string } {
  const today = todayYmd(timeZone);
  const d = new Date(`${today}T00:00:00Z`);
  if (period === "today") return { from: today, to: today };
  if (period === "week") {
    const dow = (d.getUTCDay() + 6) % 7;
    return { from: addDays(today, -dow), to: today };
  }
  if (period === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

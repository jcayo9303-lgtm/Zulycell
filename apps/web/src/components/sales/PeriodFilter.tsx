"use client";

import { useState } from "react";
import { Input, Segmented } from "@/components/ui";
import { todayIso } from "@/lib/format";

export type Period = "today" | "week" | "month" | "year" | "custom";

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "year", label: "Año" },
  { value: "custom", label: "Personalizado" },
];

/** Estado del período; `query` se pasa tal cual a la API (period o from/to). */
export function usePeriod(initial: Period = "month") {
  const [period, setPeriod] = useState<Period>(initial);
  const [from, setFrom] = useState(`${todayIso().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayIso());
  const query = period === "custom" ? { from, to } : { period };
  return { period, setPeriod, from, setFrom, to, setTo, query };
}

export function PeriodFilter({ state, onChange }: { state: ReturnType<typeof usePeriod>; onChange?: () => void }) {
  const { period, setPeriod, from, setFrom, to, setTo } = state;
  return (
    <div className="row wrap">
      <Segmented
        value={period}
        onChange={(v) => {
          setPeriod(v);
          onChange?.();
        }}
        options={PERIODS}
      />
      {period === "custom" && (
        <>
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value || to);
              onChange?.();
            }}
            style={{ width: 150 }}
            aria-label="Desde"
          />
          <Input
            type="date"
            value={to}
            min={from}
            max={todayIso()}
            onChange={(e) => {
              setTo(e.target.value || todayIso());
              onChange?.();
            }}
            style={{ width: 150 }}
            aria-label="Hasta"
          />
        </>
      )}
    </div>
  );
}

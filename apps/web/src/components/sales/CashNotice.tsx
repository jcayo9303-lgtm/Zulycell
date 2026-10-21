"use client";

import Link from "next/link";
import { Alert } from "@/components/ui";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useSession } from "@/lib/session";

/** Aviso no bloqueante en el POS cuando no hay una caja abierta. */
export function CashNotice() {
  const { can } = useSession();
  const allowed = can("cash_manage", "balance_view");
  const current = useFetch(
    () => (allowed ? api.get<{ session: { id: string } | null }>("/cash/current").catch(() => null) : Promise.resolve(null)),
    [],
  );
  if (!allowed || !current.data || current.data.session) return null;
  return (
    <div className="no-print" style={{ marginBottom: 12 }}>
      <Alert tone="info">
        No hay una caja abierta. Puedes vender igual, pero para cuadrar el efectivo del turno <Link href="/caja">abre la caja</Link>.
      </Alert>
    </div>
  );
}

"use client";

import { Badge, Empty } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { Movement } from "./types";

/** Historial de deudas y abonos / pagos */
export function LedgerTable({ movements, debtLabel, paymentLabel }: { movements: Movement[]; debtLabel: string; paymentLabel: string }) {
  const { money, me } = useSession();
  if (!movements.length) return <Empty title="Sin movimientos">Aquí verás las deudas y los pagos registrados.</Empty>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Detalle</th>
            <th className="num">Monto</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id}>
              <td className="muted">{fmtDateTime(m.createdAt, me.business.timezone)}</td>
              <td>
                {m.type === "DEBT" ? <Badge tone="danger">{debtLabel}</Badge> : <Badge tone="success">{paymentLabel}</Badge>}
              </td>
              <td>
                {m.description ?? "—"}
                {m.method && <span className="note"> · {PAYMENT_METHODS[m.method as PaymentMethod] ?? m.method}</span>}
              </td>
              <td className={`num ${m.type === "DEBT" ? "text-danger" : "text-success"}`}>
                {m.type === "DEBT" ? "+" : "−"} {money(m.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

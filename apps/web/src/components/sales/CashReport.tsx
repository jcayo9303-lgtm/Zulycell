"use client";

import { Fragment } from "react";
import type { CashSession, CashSummary } from "./types";
import { fmtDateTime } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/labels";
import { useSession } from "@/lib/session";

const methodName = (m: PaymentMethod | null) => (m ? PAYMENT_METHODS[m] : "Sin especificar");

const SECTIONS: { key: keyof Pick<CashSummary, "sales" | "repairs" | "clientPayments" | "expenses" | "purchases" | "supplierPayments">; label: string }[] = [
  { key: "sales", label: "Ventas" },
  { key: "repairs", label: "Reparaciones" },
  { key: "clientPayments", label: "Abonos de clientes" },
  { key: "expenses", label: "Gastos" },
  { key: "purchases", label: "Compras" },
  { key: "supplierPayments", label: "Pagos a proveedores" },
];

/** Desglose por método de pago de cada concepto de la caja. */
export function MethodBreakdown({ summary }: { summary: CashSummary }) {
  const { money } = useSession();
  const sections = SECTIONS.filter((s) => summary[s.key].byMethod.length);
  if (!sections.length) return <p className="note">Aún no hay movimientos en esta caja.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Concepto</th>
            <th>Método</th>
            <th className="num">Cant.</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <Fragment key={s.key}>
              {summary[s.key].byMethod.map((m, i) => (
                <tr key={`${s.key}-${m.method}`}>
                  <td>{i === 0 ? <strong>{s.label}</strong> : null}</td>
                  <td>{methodName(m.method)}</td>
                  <td className="num">{m.count}</td>
                  <td className="num">{money(m.total)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Reporte de cierre imprimible. */
export function CashReport({ session }: { session: CashSession }) {
  const { money, me } = useSession();
  const tz = me.business.timezone;
  const s = session.summary;
  const diff = session.difference;

  const line = (label: string, value: number | null | undefined, opts?: { strong?: boolean; tone?: string }) => (
    <tr>
      <td style={opts?.strong ? { fontWeight: 650 } : undefined}>{label}</td>
      <td className={`num ${opts?.tone ?? ""}`} style={opts?.strong ? { fontWeight: 650 } : undefined}>
        {value === null || value === undefined ? "—" : money(value)}
      </td>
    </tr>
  );

  return (
    <div className="cash-report stack">
      {/* Al imprimir solo se ve el reporte (misma técnica que el comprobante de venta) */}
      <style>{`@media print { body * { visibility: hidden !important; } .cash-report, .cash-report * { visibility: visible !important; } .cash-report { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 16px; } }`}</style>
      <div>
        <div className="card-title">{me.business.name} · Cierre de caja</div>
        <div className="note">
          Apertura: {fmtDateTime(session.openedAt, tz)} por {session.openedByName ?? "—"}
          {session.closedAt && (
            <>
              {" "}
              · Cierre: {fmtDateTime(session.closedAt, tz)} por {session.closedByName ?? "—"}
            </>
          )}
        </div>
      </div>

      <table className="table">
        <tbody>
          {line("Monto de apertura", s.openingAmount)}
          {line("Ventas (todos los métodos)", s.sales.total)}
          {line("Reparaciones", s.repairs.total)}
          {line("Abonos de clientes", s.clientPayments.total)}
          {line("Gastos", s.expenses.total)}
          {line("Pagos a proveedores", s.supplierPayments.total)}
          {line("Ingresos manuales de efectivo", s.movements.in)}
          {line("Retiros de efectivo", s.movements.out)}
          {line("Entradas en efectivo", s.cashIn)}
          {line("Salidas en efectivo", s.cashOut)}
          {line("Efectivo esperado", s.expectedCash, { strong: true })}
          {session.status === "CLOSED" && (
            <>
              {line("Efectivo contado", session.countedCash, { strong: true })}
              {line(
                diff === null ? "Diferencia" : diff > 0 ? "Sobrante" : diff < 0 ? "Faltante" : "Diferencia (cuadra)",
                diff,
                { strong: true, tone: diff ? (diff > 0 ? "text-success" : "text-danger") : "" },
              )}
            </>
          )}
        </tbody>
      </table>

      <div className="section-title">Desglose por método de pago</div>
      <MethodBreakdown summary={s} />

      {session.movements.length > 0 && (
        <>
          <div className="section-title">Ingresos y retiros de efectivo</div>
          <table className="table">
            <tbody>
              {session.movements.map((m) => (
                <tr key={m.id}>
                  <td>{fmtDateTime(m.createdAt, tz)}</td>
                  <td>{m.type === "IN" ? "Ingreso" : "Retiro"}</td>
                  <td>{m.reason}</td>
                  <td className={`num ${m.type === "IN" ? "text-success" : "text-danger"}`}>
                    {m.type === "IN" ? "+" : "−"}
                    {money(m.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {session.notes && <p className="note">Notas: {session.notes}</p>}
    </div>
  );
}

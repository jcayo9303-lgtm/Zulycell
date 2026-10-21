"use client";

import s from "./repairs.module.css";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, fmtSeq } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/labels";
import type { RepairDetail } from "./types";

/** Fecha de fin de garantía: entrega + días de garantía */
export function warrantyUntil(r: Pick<RepairDetail, "deliveredAt" | "warrantyDays">): Date | null {
  if (!r.deliveredAt || !r.warrantyDays) return null;
  const d = new Date(r.deliveredAt);
  d.setDate(d.getDate() + r.warrantyDays);
  return d;
}

/**
 * Documentos imprimibles de la reparación.
 * "order": orden de recepción (original para el cliente + talón del taller).
 * "delivery": comprobante de entrega con repuestos, pagos y garantía.
 */
export function RepairPrint({ repair, mode }: { repair: RepairDetail; mode: "order" | "delivery" }) {
  const b = repair.business;
  const tz = b.timezone;
  const m = (n: number) => fmtMoney(n, b.currency, b.currencySymbol);
  const until = warrantyUntil(repair);
  const advance = repair.payments.reduce((a, p) => a + p.amount, 0);

  const header = (title: string) => (
    <header className={s.ticketHead}>
      <div>
        {b.logoUrl && <img src={b.logoUrl} alt="" className={s.ticketLogo} />}
        <div className="card-title">{b.name}</div>
        <div className="note">
          {b.taxId && (
            <div>
              NIT <span className="mono">{b.taxId}</span>
            </div>
          )}
          {b.address && <div>{b.address}</div>}
          {[b.phone, b.email].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div>
        <div className={s.ticketTitle}>{title}</div>
        <div className="mono" style={{ textAlign: "right" }}>
          N.º {fmtSeq(repair.number)}
        </div>
        <div className="note" style={{ textAlign: "right" }}>
          {mode === "order" ? `Recibido: ${fmtDateTime(repair.createdAt, tz)}` : `Entregado: ${fmtDateTime(repair.deliveredAt, tz)}`}
        </div>
      </div>
    </header>
  );

  const device = (
    <section className={s.ticketSection}>
      <h3>Equipo</h3>
      <div className={s.ticketGrid}>
        <div>
          {repair.deviceType}: <strong>{repair.brand} {repair.model}</strong>
        </div>
        <div>
          IMEI / serie: <span className="mono">{repair.imei || "—"}</span>
        </div>
        <div>Color: {repair.color || "—"}</div>
        <div>Accesorios: {repair.accessories || "Ninguno"}</div>
      </div>
    </section>
  );

  const client = (
    <section className={s.ticketSection}>
      <h3>Cliente</h3>
      <div className={s.ticketGrid}>
        <div>
          <strong>{repair.client.name}</strong>
        </div>
        <div>Celular: {repair.client.phone || "—"}</div>
        {repair.client.document && (
          <div>
            Documento: <span className="mono">{repair.client.document}</span>
          </div>
        )}
      </div>
    </section>
  );

  if (mode === "order") {
    return (
      <div className={s.ticket}>
        {header("Orden de servicio técnico")}
        {client}
        {device}
        <section className={s.ticketSection}>
          <h3>Falla reportada</h3>
          <div>{repair.reportedIssue}</div>
          {repair.physicalCondition && (
            <div style={{ marginTop: 4 }}>
              <strong>Estado físico:</strong> {repair.physicalCondition}
            </div>
          )}
        </section>
        <section className={s.ticketSection}>
          <div className={s.ticketGrid}>
            <div>Costo estimado: {m(repair.estimatedCost)}</div>
            <div>Adelanto: {m(advance)}</div>
            <div>Entrega estimada: {repair.promisedAt ? fmtDateTime(repair.promisedAt, tz) : "Por confirmar"}</div>
            <div>Garantía del servicio: {repair.warrantyDays} días</div>
          </div>
        </section>
        {b.repairTerms && <div className={s.terms}>{b.repairTerms}</div>}
        <div className={s.signatures}>
          <div>Firma del cliente</div>
          <div>Recibido por {repair.receivedByName ?? b.name}</div>
        </div>

        <div className={s.cut} />
        <div className="row-between">
          <strong>Talón del taller · N.º <span className="mono">{fmtSeq(repair.number)}</span></strong>
          <span className="note">{fmtDate(repair.createdAt, tz)}</span>
        </div>
        <div>
          {repair.client.name} · {repair.client.phone || "sin celular"} · {repair.brand} {repair.model}
          {repair.imei && (
            <>
              {" "}
              · IMEI <span className="mono">{repair.imei}</span>
            </>
          )}
        </div>
        <div className="note">
          Falla: {repair.reportedIssue}
          {repair.accessCode ? ` · Clave: ${repair.accessCode}` : ""}
        </div>
      </div>
    );
  }

  return (
    <div className={s.ticket}>
      {header("Comprobante de entrega")}
      {client}
      {device}
      {repair.diagnosis && (
        <section className={s.ticketSection}>
          <h3>Trabajo realizado</h3>
          <div>{repair.diagnosis}</div>
        </section>
      )}
      <section className={s.ticketSection}>
        <table className="table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th className="num">Cant.</th>
              <th className="num">P. unit.</th>
              <th className="num">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {repair.laborCost > 0 && (
              <tr>
                <td>Mano de obra</td>
                <td className="num">1</td>
                <td className="num">{m(repair.laborCost)}</td>
                <td className="num">{m(repair.laborCost)}</td>
              </tr>
            )}
            {repair.parts.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="num">{fmtNumber(p.quantity, Number.isInteger(p.quantity) ? 0 : 3)}</td>
                <td className="num">{m(p.unitPrice)}</td>
                <td className="num">{m(p.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={s.ticketSection}>
        <div className={s.totals} style={{ maxWidth: 300, marginLeft: "auto" }}>
          <div className={s.grand}>
            <span>Total</span>
            <span className="num">{m(repair.total)}</span>
          </div>
          {repair.payments.map((p) => (
            <div key={p.id} className="note">
              <span>
                {fmtDate(p.createdAt, tz)} · {PAYMENT_METHODS[p.method]}
              </span>
              <span className="num">{m(p.amount)}</span>
            </div>
          ))}
          <div>
            <span>Saldo</span>
            <span className="num">{m(repair.balance)}</span>
          </div>
        </div>
      </section>
      <section className={s.ticketSection}>
        <h3>Garantía</h3>
        <div>
          {until
            ? `${repair.warrantyDays} días, válida hasta el ${fmtDate(until, tz)}. Presenta este comprobante para hacerla efectiva.`
            : "Sin garantía."}
        </div>
      </section>
      {b.repairTerms && <div className={s.terms}>{b.repairTerms}</div>}
      <div className={s.signatures}>
        <div>Recibí conforme</div>
        <div>Entregado por {b.name}</div>
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import s from "./contacts.module.css";
import { fmtDate, fmtMoney, fmtNumber, fmtSeq } from "@/lib/format";
import type { DocBusiness } from "./types";

export type PrintItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
  subtotal: number;
};

/** Documento imprimible: Descargar PDF = imprimir y "Guardar como PDF" */
export function PrintDocument({
  business,
  title,
  number,
  meta,
  party,
  items,
  totals,
  notes,
  footer,
  showTax,
}: {
  business: DocBusiness;
  title: string;
  number: number | null;
  meta: { label: string; value: ReactNode }[];
  party: { label: string; lines: (string | null | undefined)[] };
  items: PrintItem[];
  totals: { label: string; value: number; strong?: boolean }[];
  notes?: string | null;
  footer?: ReactNode;
  showTax?: boolean;
}) {
  const m = (n: number) => fmtMoney(n, business.currency, business.currencySymbol);
  return (
    <article className={s.paper}>
      <header className={s.paperHeader}>
        <div>
          {business.logoUrl && <img src={business.logoUrl} alt="" className={s.paperLogo} />}
          <div className="card-title">{business.name}</div>
          <div className="note">
            {business.taxId && (
              <div>
                NIT <span className="mono">{business.taxId}</span>
              </div>
            )}
            {business.address && <div>{business.address}</div>}
            {[business.phone, business.email].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div>
          <div className={s.paperDocTitle}>{title}</div>
          <div className={`${s.paperMeta} mono`}>N.º {fmtSeq(number)}</div>
          {meta.map((x) => (
            <div key={x.label} className={s.paperMeta}>
              {x.label}: {x.value}
            </div>
          ))}
        </div>
      </header>

      <div className={s.paperParty}>
        <div>
          <div className="note">{party.label}</div>
          {party.lines.filter(Boolean).map((l, i) => (
            <div key={i} className={i === 0 ? "section-title" : undefined}>
              {l}
            </div>
          ))}
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Descripción</th>
            <th className="num">Cant.</th>
            <th className="num">P. unit.</th>
            {items.some((i) => i.discount) && <th className="num">Desc.</th>}
            {showTax && <th className="num">Imp.</th>}
            <th className="num">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, idx) => (
            <tr key={idx}>
              <td>{i.name}</td>
              <td className="num">{fmtNumber(i.quantity, Number.isInteger(i.quantity) ? 0 : 3)}</td>
              <td className="num">{m(i.unitPrice)}</td>
              {items.some((x) => x.discount) && <td className="num">{i.discount ? m(i.discount) : "—"}</td>}
              {showTax && <td className="num">{i.taxRate ?? 0} %</td>}
              <td className="num">{m(i.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={s.totals} style={{ marginTop: 16 }}>
        {totals.map((t) => (
          <div key={t.label} className={t.strong ? s.grandTotal : undefined}>
            <span>{t.label}</span>
            <span className="num">{m(t.value)}</span>
          </div>
        ))}
      </div>

      {(notes || footer) && (
        <div className={s.paperFoot}>
          {notes}
          {footer}
        </div>
      )}
    </article>
  );
}

/** Campos @db.Date llegan como ISO a medianoche UTC: se formatea solo la parte de fecha */
export const docDate = (v: string | null | undefined) => (v ? fmtDate(v.slice(0, 10)) : "—");

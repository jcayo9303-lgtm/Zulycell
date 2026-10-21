"use client";

import type { ReactNode } from "react";
import { MessageCircle, Printer } from "lucide-react";
import s from "./Receipt.module.css";
import { Button } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, fmtSeq } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/labels";
import type { SaleDetail } from "./types";

/** Al imprimir solo se ve el comprobante (sirve también para "Guardar como PDF"). */
const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  .zc-print, .zc-print * { visibility: visible !important; }
  .zc-print { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
}`;

export function receiptText(sale: SaleDetail): string {
  const m = (n: number) => fmtMoney(n, sale.business.currency, sale.business.currencySymbol);
  const lines = [
    `*${sale.business.name}*`,
    `Comprobante #${fmtSeq(sale.number)} · ${fmtDateTime(sale.createdAt, sale.business.timezone)}`,
    "",
    ...sale.items.flatMap((i) => [
      `${fmtNumber(i.quantity, Number.isInteger(i.quantity) ? 0 : 3)} × ${i.name}: ${m(i.subtotal)}`,
      ...(i.serials?.length ? [`  IMEI: ${i.serials.join(", ")}`] : []),
      ...(i.warrantyUntil ? [`  Garantía hasta ${fmtDate(i.warrantyUntil.slice(0, 10))}`] : []),
    ]),
    "",
    ...(sale.discountTotal > 0 ? [`Descuento: −${m(sale.discountTotal)}`] : []),
    `*Total: ${m(sale.total)}*`,
    `Pago: ${PAYMENT_METHODS[sale.method]}`,
  ];
  if (sale.business.receiptFooter) lines.push("", sale.business.receiptFooter);
  return lines.join("\n");
}

export function whatsappUrl(sale: SaleDetail): string {
  const phone = sale.client?.phone?.replace(/\D/g, "") ?? "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(receiptText(sale))}`;
}

export function Receipt({ sale, actions }: { sale: SaleDetail; actions?: ReactNode }) {
  const b = sale.business;
  const m = (n: number) => fmtMoney(n, b.currency, b.currencySymbol);

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className={`${s.receipt} zc-print`}>
        {sale.status === "VOIDED" && <div className={s.voided}>ANULADA</div>}
        <div className={s.head}>
          {b.receiptShowLogo && b.logoUrl && <div className={s.logo} style={{ backgroundImage: `url("${b.logoUrl}")` }} />}
          <div className={s.business}>{b.name}</div>
          {b.taxId && <div className={s.meta}>NIT <span className="mono">{b.taxId}</span></div>}
          {b.address && <div className={s.meta}>{b.address}</div>}
          {b.phone && <div className={s.meta}>Tel. {b.phone}</div>}
        </div>

        <div className={s.line}>
          <span>Comprobante</span>
          <span className="mono">#{fmtSeq(sale.number)}</span>
        </div>
        <div className={s.line}>
          <span>Fecha</span>
          <span>{fmtDateTime(sale.createdAt, b.timezone)}</span>
        </div>
        {sale.client && (
          <div className={s.line}>
            <span>Cliente</span>
            <span>{sale.client.name}</span>
          </div>
        )}
        {sale.seller && (
          <div className={s.line}>
            <span>Atendió</span>
            <span>{sale.seller}</span>
          </div>
        )}

        <hr className={s.divider} />
        <table className={s.items}>
          <tbody>
            {sale.items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.name}
                  <div className={s.itemSub}>
                    {fmtNumber(i.quantity, Number.isInteger(i.quantity) ? 0 : 3)} × {m(i.unitPrice)}
                    {i.discountValue > 0 &&
                      ` · desc. ${i.discountType === "PERCENT" ? `${fmtNumber(i.discountValue, 0)} %` : m(i.discountValue)}`}
                  </div>
                  {i.serials?.map((serial) => (
                    <div key={serial} className={s.itemSub}>
                      IMEI <span className="mono">{serial}</span>
                    </div>
                  ))}
                  {i.warrantyUntil && <div className={s.itemSub}>Garantía hasta {fmtDate(i.warrantyUntil.slice(0, 10))}</div>}
                </td>
                <td className="num">{m(i.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className={s.divider} />

        <div className={s.line}>
          <span>Subtotal</span>
          <span>{m(sale.subtotal)}</span>
        </div>
        {sale.discountTotal > 0 && (
          <div className={s.line}>
            <span>Descuento</span>
            <span>−{m(sale.discountTotal)}</span>
          </div>
        )}
        <div className={s.total}>
          <span>Total</span>
          <span>{m(sale.total)}</span>
        </div>
        <div className={s.line}>
          <span>Pago</span>
          <span>{PAYMENT_METHODS[sale.method]}</span>
        </div>
        {sale.received != null && (
          <>
            <div className={s.line}>
              <span>Recibido</span>
              <span>{m(sale.received)}</span>
            </div>
            <div className={s.line}>
              <span>Cambio</span>
              <span>{m(sale.change ?? 0)}</span>
            </div>
          </>
        )}
        {sale.notes && <div className={s.foot}>{sale.notes}</div>}
        <div className={s.foot}>{b.receiptFooter || "¡Gracias por su compra!"}</div>
      </div>

      <div className={`${s.actions} no-print`}>
        <Button icon={<MessageCircle size={14} />} onClick={() => window.open(whatsappUrl(sale), "_blank", "noopener")}>
          Compartir por WhatsApp
        </Button>
        <Button icon={<Printer size={14} />} onClick={() => window.print()}>
          Imprimir / PDF
        </Button>
        {actions}
      </div>
    </div>
  );
}

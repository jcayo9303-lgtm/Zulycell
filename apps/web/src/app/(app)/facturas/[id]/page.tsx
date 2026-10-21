"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Ban, Mail, Pencil, Printer, Send } from "lucide-react";
import { Alert, Badge, Button, Loading, PageHeader, useConfirm, useToast } from "@/components/ui";
import { PrintDocument, docDate } from "@/components/contacts/PrintDocument";
import { api, ApiError } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtSeq } from "@/lib/format";
import { INVOICE_STATUS, INVOICE_TYPES, PAYMENT_METHODS } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { STATUS_TONE, type Invoice } from "../types";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { isOwner } = useSession();
  const { data, error, reload } = useFetch(() => api.get<Invoice>(`/invoices/${id}`), [id]);
  const [busy, setBusy] = useState<string | null>(null);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;
  const inv = data;

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo completar la acción", true);
    } finally {
      setBusy(null);
    }
  };

  const issue = () =>
    act("issue", async () => {
      if (!confirm("¿Emitir la factura? Ya no podrás editarla.")) return;
      await api.post(`/invoices/${id}/issue`);
      toast("Factura emitida");
      await reload();
    });

  const sendEmail = () =>
    act("email", async () => {
      const r = await api.post<{ to: string }>(`/invoices/${id}/email`);
      toast(`Factura enviada a ${r.to}`);
    });

  const voidInvoice = () =>
    act("void", async () => {
      const msg = inv.status === "DRAFT" ? "¿Anular este borrador?" : "¿Anular la factura? Se generará una nota crédito por el total.";
      if (!confirm(msg)) return;
      const r = await api.post<{ id?: string }>(`/invoices/${id}/void`);
      toast(r.id ? "Factura anulada con nota crédito" : "Borrador anulado");
      if (r.id) router.push(`/facturas/${r.id}`);
      else await reload();
    });

  const isDraft = inv.status === "DRAFT";
  const title = INVOICE_TYPES[inv.type];

  return (
    <>
      <div className="no-print stack" style={{ marginBottom: 16 }}>
        <PageHeader
          title={
            <span className="row">
              {title} <span className="mono">{fmtSeq(inv.number)}</span>
              <Badge tone={STATUS_TONE[inv.status]}>{INVOICE_STATUS[inv.status]}</Badge>
            </span>
          }
          subtitle={<Link href="/facturas"><ArrowLeft size={12} /> Volver a facturas</Link>}
          actions={
            <>
              <Button icon={<Printer size={14} />} onClick={() => window.print()}>
                {isDraft ? "Previsualizar / imprimir" : "Descargar PDF"}
              </Button>
              {isDraft && (
                <>
                  <Link href={`/facturas/${id}/editar`}>
                    <Button icon={<Pencil size={14} />}>Editar</Button>
                  </Link>
                  <Button variant="primary" icon={<Send size={14} />} loading={busy === "issue"} onClick={issue}>
                    Emitir factura
                  </Button>
                </>
              )}
              {inv.status === "ISSUED" && (
                <Button icon={<Mail size={14} />} loading={busy === "email"} onClick={sendEmail}>
                  Enviar por email
                </Button>
              )}
              {isOwner && inv.status !== "VOIDED" && (isDraft || inv.type === "SALE") && (
                <Button variant="danger" icon={<Ban size={14} />} loading={busy === "void"} onClick={voidInvoice}>
                  Anular
                </Button>
              )}
            </>
          }
        />
        {isDraft && <Alert tone="info">Borrador: así se verá la factura. Al emitirla se asigna el código de la autoridad tributaria (modo simulado).</Alert>}
      </div>

      <PrintDocument
        business={inv.business}
        title={title}
        number={inv.number}
        meta={[
          { label: "Fecha de emisión", value: docDate(inv.issueDate) },
          { label: "Método de pago", value: PAYMENT_METHODS[inv.method] },
          ...(inv.related ? [{ label: "Referencia", value: <span className="mono">N.º {fmtSeq(inv.related.number)}</span> }] : []),
        ]}
        party={{
          label: "Receptor",
          lines: [inv.receiverName, `NIT / Doc.: ${inv.receiverTaxId}`, inv.receiverAddress, inv.receiverEmail],
        }}
        items={inv.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
          taxRate: i.taxRate,
          subtotal: i.subtotal,
        }))}
        showTax
        totals={[
          { label: "Subtotal", value: inv.subtotal },
          ...(inv.discountTotal ? [{ label: "Descuento", value: -inv.discountTotal }] : []),
          { label: "Impuesto", value: inv.taxTotal },
          { label: "Total", value: inv.total, strong: true },
        ]}
        notes={inv.notes}
        footer={
          <div style={{ marginTop: inv.notes ? 8 : 0 }}>
            {inv.business.taxAuthority && <>Autoridad tributaria: {inv.business.taxAuthority} · </>}
            Código: <span className="mono">{inv.providerRef ?? "pendiente de emisión"}</span>
          </div>
        }
      />
    </>
  );
}

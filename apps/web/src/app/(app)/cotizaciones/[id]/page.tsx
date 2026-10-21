"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, MessageCircle, Pencil, Printer, ShoppingCart, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Field, Input, Loading, Modal, PageHeader, Select, useConfirm, useToast } from "@/components/ui";
import { PrintDocument, docDate } from "@/components/contacts/PrintDocument";
import { api, ApiError } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtMoney, fmtSeq } from "@/lib/format";
import { PAYMENT_METHODS, options } from "@/lib/labels";
import type { Quote } from "../types";

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, reload } = useFetch(() => api.get<Quote>(`/quotes/${id}`), [id]);
  const [converting, setConverting] = useState(false);
  const [method, setMethod] = useState("CASH");
  const [received, setReceived] = useState("");
  const [convertError, setConvertError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;
  const quote = data;
  const m = (n: number) => fmtMoney(n, quote.business.currency, quote.business.currencySymbol);
  const clientName = quote.client?.name ?? quote.clientName;

  const shareWhatsApp = () => {
    const lines = quote.items.map((i) => `• ${i.name} × ${i.quantity}: ${m(i.subtotal)}`).join("\n");
    const text = [
      `*Cotización N.º ${fmtSeq(quote.number)} — ${quote.business.name}*`,
      clientName ? `Para: ${clientName}` : null,
      "",
      lines,
      "",
      quote.discountTotal ? `Descuento: ${m(quote.discountTotal)}` : null,
      `*Total: ${m(quote.total)}*`,
      quote.validUntil ? `Válida hasta: ${docDate(quote.validUntil)}` : null,
      quote.notes ? `\n${quote.notes}` : null,
    ]
      .filter((x) => x !== null)
      .join("\n");
    const phone = quote.client?.phone?.replace(/\D/g, "") ?? "";
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  const duplicate = async () => {
    const copy = await api.post<{ id: string }>(`/quotes/${id}/duplicate`);
    toast("Cotización duplicada");
    router.push(`/cotizaciones/${copy.id}/editar`);
  };

  const remove = async () => {
    if (!confirm("¿Eliminar esta cotización?")) return;
    await api.del(`/quotes/${id}`);
    toast("Cotización eliminada");
    router.push("/cotizaciones");
  };

  const convert = async () => {
    setBusy(true);
    setConvertError(null);
    try {
      const sale = await api.post<{ number: number }>(`/quotes/${id}/convert`, {
        method,
        received: method === "CASH" && received ? Number(received) : null,
      });
      setConverting(false);
      toast(`Venta N.º ${fmtSeq(sale.number)} registrada`);
      void reload();
    } catch (e) {
      setConvertError(e instanceof ApiError ? e.message : "No se pudo convertir");
    } finally {
      setBusy(false);
    }
  };

  const draft = quote.status === "DRAFT";

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={
            <span className="row">
              Cotización <span className="mono">{fmtSeq(quote.number)}</span>
              {draft ? <Badge tone="info">Vigente</Badge> : <Badge tone="success">Convertida en venta</Badge>}
            </span>
          }
          subtitle={<Link href="/cotizaciones"><ArrowLeft size={12} /> Volver a cotizaciones</Link>}
          actions={
            <>
              <Button icon={<Printer size={14} />} onClick={() => window.print()}>
                Descargar PDF
              </Button>
              <Button icon={<MessageCircle size={14} />} onClick={shareWhatsApp}>
                WhatsApp
              </Button>
              <Button icon={<Copy size={14} />} onClick={duplicate}>
                Duplicar
              </Button>
              {draft && (
                <>
                  <Link href={`/cotizaciones/${id}/editar`}>
                    <Button icon={<Pencil size={14} />}>Editar</Button>
                  </Link>
                  <Button variant="danger" icon={<Trash2 size={14} />} onClick={remove} />
                  <Button variant="primary" icon={<ShoppingCart size={14} />} onClick={() => setConverting(true)}>
                    Convertir en venta
                  </Button>
                </>
              )}
            </>
          }
        />
      </div>

      <PrintDocument
        business={quote.business}
        title="Cotización"
        number={quote.number}
        meta={[
          { label: "Fecha", value: docDate(quote.date) },
          ...(quote.validUntil ? [{ label: "Válida hasta", value: docDate(quote.validUntil) }] : []),
        ]}
        party={{
          label: "Cliente",
          lines: [clientName ?? "Cliente general", quote.client?.document, quote.client?.phone, quote.client?.address],
        }}
        items={quote.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: Math.round((i.quantity * i.unitPrice - i.subtotal) * 100) / 100,
          subtotal: i.subtotal,
        }))}
        totals={[
          { label: "Subtotal", value: quote.subtotal },
          ...(quote.discountTotal ? [{ label: "Descuento", value: -quote.discountTotal }] : []),
          { label: "Total", value: quote.total, strong: true },
        ]}
        notes={quote.notes}
      />

      <Modal
        open={converting}
        onClose={() => setConverting(false)}
        title="Convertir en venta"
        width={420}
        footer={
          <>
            <Button onClick={() => setConverting(false)}>Cancelar</Button>
            <Button variant="primary" loading={busy} onClick={convert}>
              Confirmar venta
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="row-between">
            <span className="muted">Total a cobrar</span>
            <span className="card-title num">{m(quote.total)}</span>
          </div>
          <Field label="Método de pago" required hint={method === "CREDIT" ? "Se registrará como deuda del cliente" : undefined}>
            <Select value={method} onChange={(e) => setMethod(e.target.value)} options={options(PAYMENT_METHODS)} />
          </Field>
          {method === "CASH" && (
            <Field label="Monto recibido" hint={Number(received) >= quote.total ? `Vuelto: ${m(Number(received) - quote.total)}` : undefined}>
              <Input type="number" min={quote.total} step="0.01" className="num" value={received} onChange={(e) => setReceived(e.target.value)} />
            </Field>
          )}
          <p className="note">Se descontará el stock de los productos cotizados.</p>
          {convertError && <Alert>{convertError}</Alert>}
        </div>
      </Modal>
    </>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import s from "@/components/contacts/contacts.module.css";
import { Alert, Button, Card, Combobox, Field, Input, Select, Textarea } from "@/components/ui";
import { ProductLines, lineDiscount, lineSubtotal, newLine, type Line } from "@/components/contacts/ProductLines";
import type { ClientRow } from "@/components/contacts/types";
import { api, ApiError, type Paginated } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtSeq, round2 } from "@/lib/format";
import { INVOICE_TYPES, PAYMENT_METHODS, options } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { Invoice } from "./types";

type Receiver = { receiverName: string; receiverTaxId: string; receiverAddress: string; receiverEmail: string };

/** Formulario de factura electrónica (docs §17) */
export function InvoiceEditor({ invoice }: { invoice?: Invoice }) {
  const router = useRouter();
  const { money } = useSession();
  const business = useFetch(() => api.get<{ taxRates: number[]; taxAuthority: string }>("/business"));
  const issued = useFetch(() =>
    api.get<Paginated<Pick<Invoice, "id" | "number" | "type" | "status" | "receiverName" | "clientId">>>("/invoices", { pageSize: 200 }),
  );
  const taxRates = business.data?.taxRates ?? [0];

  const [type, setType] = useState<Invoice["type"]>(invoice?.type ?? "SALE");
  const [client, setClient] = useState<{ id: string; name: string } | null>(
    invoice ? { id: invoice.clientId, name: invoice.receiverName } : null,
  );
  const [receiver, setReceiver] = useState<Receiver>({
    receiverName: invoice?.receiverName ?? "",
    receiverTaxId: invoice?.receiverTaxId ?? "",
    receiverAddress: invoice?.receiverAddress ?? "",
    receiverEmail: invoice?.receiverEmail ?? "",
  });
  const [related, setRelated] = useState(invoice?.relatedInvoiceId ?? "");
  const [lines, setLines] = useState<Line[]>(
    invoice?.items.map((i) =>
      newLine({
        productId: i.productId,
        name: i.name,
        quantity: String(i.quantity),
        price: String(i.unitPrice),
        discountValue: i.discount ? String(i.discount) : "",
        taxRate: String(i.taxRate),
      }),
    ) ?? [],
  );
  const [method, setMethod] = useState<string>(invoice?.method ?? "CASH");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const subtotal = round2(lines.reduce((a, l) => a + lineSubtotal(l, "invoice") + lineDiscount(l, "invoice"), 0));
  const discount = round2(lines.reduce((a, l) => a + lineDiscount(l, "invoice"), 0));
  const tax = round2(lines.reduce((a, l) => a + round2((lineSubtotal(l, "invoice") * (Number(l.taxRate) || 0)) / 100), 0));
  const total = round2(subtotal - discount + tax);

  const relatedOptions = (issued.data?.items ?? [])
    .filter((i) => i.type === "SALE" && i.status === "ISSUED" && (!client || i.clientId === client.id))
    .map((i) => ({ value: i.id, label: `N.º ${fmtSeq(i.number)} · ${i.receiverName}` }));

  const valid =
    client &&
    receiver.receiverTaxId.trim() &&
    receiver.receiverName.trim() &&
    receiver.receiverAddress.trim() &&
    receiver.receiverEmail.trim() &&
    lines.length > 0 &&
    lines.every((l) => l.name.trim() && Number(l.quantity) > 0 && Number(l.price) > 0) &&
    (type === "SALE" || related);

  const pickClient = (c: ClientRow) => {
    setClient({ id: c.id, name: c.name });
    setReceiver({
      receiverName: c.name,
      receiverTaxId: c.document ?? "",
      receiverAddress: c.address ?? "",
      receiverEmail: c.email ?? "",
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError(null);
    setFields({});
    const body = {
      type,
      clientId: client.id,
      ...receiver,
      items: lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        quantity: Number(l.quantity),
        unitPrice: Number(l.price),
        taxRate: Number(l.taxRate),
        discount: Number(l.discountValue) || 0,
      })),
      method,
      notes,
      relatedInvoiceId: type === "SALE" ? null : related,
    };
    try {
      const saved = invoice ? await api.put<{ id: string }>(`/invoices/${invoice.id}`, body) : await api.post<{ id: string }>("/invoices", body);
      router.push(`/facturas/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      }
      setBusy(false);
    }
  };

  const setR = (k: keyof Receiver) => (e: { target: { value: string } }) => setReceiver({ ...receiver, [k]: e.target.value });

  return (
    <form className="stack" onSubmit={submit}>
      <Card title="Documento y receptor">
        <div className="stack">
          <div className="grid-3">
            <Field label="Tipo de documento" required>
              <Select value={type} onChange={(e) => setType(e.target.value as Invoice["type"])} options={options(INVOICE_TYPES)} />
            </Field>
            <Field label="Cliente" required hint="Debe tener documento tributario">
              <Combobox<ClientRow>
                value={client?.name}
                onClear={() => setClient(null)}
                placeholder="Buscar cliente"
                fetcher={(q) => api.get<{ items: ClientRow[] }>("/clients", { q, pageSize: 20 }).then((r) => r.items)}
                onSelect={pickClient}
                renderItem={(c) => (
                  <span>
                    {c.name} {c.document && <span className="mono note">{c.document}</span>}
                  </span>
                )}
              />
            </Field>
            {type !== "SALE" && (
              <Field label="Factura relacionada" required error={fields.relatedInvoiceId}>
                <Select value={related} onChange={(e) => setRelated(e.target.value)} placeholder="Selecciona…" options={relatedOptions} />
              </Field>
            )}
          </div>
          <div className="grid-2">
            <Field label="Nombre del receptor" required error={fields.receiverName}>
              <Input maxLength={100} value={receiver.receiverName} onChange={setR("receiverName")} />
            </Field>
            <Field label="NIT / documento del receptor" required error={fields.receiverTaxId}>
              <Input className="mono" maxLength={20} value={receiver.receiverTaxId} onChange={setR("receiverTaxId")} />
            </Field>
            <Field label="Dirección del receptor" required error={fields.receiverAddress}>
              <Input maxLength={255} value={receiver.receiverAddress} onChange={setR("receiverAddress")} />
            </Field>
            <Field label="Email del receptor" required hint="Aquí se envía la factura" error={fields.receiverEmail}>
              <Input type="email" maxLength={254} value={receiver.receiverEmail} onChange={setR("receiverEmail")} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Productos y servicios">
        <ProductLines lines={lines} onChange={setLines} mode="invoice" taxRates={taxRates} allowFree />
      </Card>

      <div className="grid-2">
        <Card title="Pago y observaciones">
          <div className="stack">
            <Field label="Método de pago" required>
              <Select value={method} onChange={(e) => setMethod(e.target.value)} options={options(PAYMENT_METHODS)} />
            </Field>
            <Field label="Notas / observaciones">
              <Textarea maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </Card>
        <Card title="Totales">
          <div className={s.totals}>
            <div>
              <span className="muted">Subtotal</span>
              <span className="num">{money(subtotal)}</span>
            </div>
            <div>
              <span className="muted">Descuento</span>
              <span className="num">− {money(discount)}</span>
            </div>
            <div>
              <span className="muted">Impuesto</span>
              <span className="num">{money(tax)}</span>
            </div>
            <div className={s.grandTotal}>
              <span>Total factura</span>
              <span className="num">{money(total)}</span>
            </div>
          </div>
        </Card>
      </div>

      {error && <Alert>{error}</Alert>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Button onClick={() => router.back()}>Cancelar</Button>
        <Button variant="primary" type="submit" loading={busy} disabled={!valid}>
          Guardar borrador
        </Button>
      </div>
    </form>
  );
}

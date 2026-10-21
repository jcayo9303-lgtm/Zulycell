"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import s from "@/components/contacts/contacts.module.css";
import { Alert, Button, Card, Combobox, Field, Input, Segmented, Textarea, Toggle } from "@/components/ui";
import { ProductLines, lineSubtotal, newLine, type Line } from "@/components/contacts/ProductLines";
import type { ClientRow } from "@/components/contacts/types";
import { api, ApiError } from "@/lib/api";
import { round2, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Quote } from "./types";

/** Formulario de cotización (docs §14) */
export function QuoteEditor({ quote }: { quote?: Quote }) {
  const router = useRouter();
  const { money } = useSession();
  const [freeClient, setFreeClient] = useState(Boolean(quote && !quote.clientId && quote.clientName));
  const [client, setClient] = useState<{ id: string; name: string } | null>(quote?.client ? { id: quote.client.id, name: quote.client.name } : null);
  const [clientName, setClientName] = useState(quote?.clientId ? "" : (quote?.clientName ?? ""));
  const [date, setDate] = useState(quote?.date.slice(0, 10) ?? todayIso());
  const [validUntil, setValidUntil] = useState(quote?.validUntil?.slice(0, 10) ?? "");
  const [lines, setLines] = useState<Line[]>(
    quote?.items.map((i) =>
      newLine({
        productId: i.productId,
        variantId: i.variantId,
        name: i.name,
        quantity: String(i.quantity),
        price: String(i.unitPrice),
        discountType: i.discountType ?? "AMOUNT",
        discountValue: i.discountValue ? String(i.discountValue) : "",
      }),
    ) ?? [],
  );
  const [discountType, setDiscountType] = useState<"AMOUNT" | "PERCENT">(quote?.discountType ?? "AMOUNT");
  const [discountValue, setDiscountValue] = useState(quote?.discountValue ? String(quote.discountValue) : "");
  const [notes, setNotes] = useState(quote?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const subtotal = round2(lines.reduce((a, l) => a + lineSubtotal(l, "quote"), 0));
  const dv = Number(discountValue) || 0;
  const discount = round2(Math.min(discountType === "PERCENT" ? (subtotal * Math.min(dv, 100)) / 100 : dv, subtotal));
  const total = round2(subtotal - discount);
  const valid = lines.length > 0 && lines.every((l) => l.name.trim() && Number(l.quantity) > 0 && Number(l.price) > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    const body = {
      clientId: freeClient ? null : (client?.id ?? null),
      clientName: freeClient ? clientName : null,
      date,
      validUntil: validUntil || null,
      items: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        name: l.name,
        quantity: Number(l.quantity),
        unitPrice: Number(l.price),
        discountType: l.discountValue ? l.discountType : null,
        discountValue: Number(l.discountValue) || 0,
      })),
      discountType: dv ? discountType : null,
      discountValue: dv,
      notes,
    };
    try {
      const saved = quote ? await api.put<{ id: string }>(`/quotes/${quote.id}`, body) : await api.post<{ id: string }>("/quotes", body);
      router.push(`/cotizaciones/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      }
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <Card title="Cliente y vigencia">
        <div className="stack">
          <Toggle checked={freeClient} onChange={setFreeClient} label="Escribir nombre libre (cliente no registrado)" />
          <div className="grid-3">
            <Field label="Cliente" error={fields.clientId ?? fields.clientName}>
              {freeClient ? (
                <Input maxLength={100} placeholder="Nombre del destinatario" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              ) : (
                <Combobox<ClientRow>
                  value={client?.name}
                  onClear={() => setClient(null)}
                  placeholder="Buscar cliente"
                  fetcher={(q) => api.get<{ items: ClientRow[] }>("/clients", { q, pageSize: 20 }).then((r) => r.items)}
                  onSelect={(c) => setClient({ id: c.id, name: c.name })}
                  renderItem={(c) => (
                    <span>
                      {c.name} {c.phone && <span className="note">{c.phone}</span>}
                    </span>
                  )}
                />
              )}
            </Field>
            <Field label="Fecha de la cotización" error={fields.date}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Vigente hasta" error={fields.validUntil}>
              <Input type="date" min={date} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Productos">
        <div className="stack">
          <ProductLines lines={lines} onChange={setLines} mode="quote" allowFree />
          {fields.items && <span className="text-danger note">{fields.items}</span>}
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Notas y condiciones">
          <Textarea maxLength={500} rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Forma de pago, tiempos de entrega, garantía…" />
        </Card>
        <Card title="Resumen">
          <div className="stack">
            <Field label="Descuento global">
              <div className="row">
                <Segmented
                  value={discountType}
                  onChange={setDiscountType}
                  options={[
                    { value: "AMOUNT", label: "Monto" },
                    { value: "PERCENT", label: "%" },
                  ]}
                />
                <Input type="number" min="0" step="0.01" className="num grow" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
              </div>
            </Field>
            <div className={s.totals}>
              <div>
                <span className="muted">Subtotal</span>
                <span className="num">{money(subtotal)}</span>
              </div>
              <div>
                <span className="muted">Descuento</span>
                <span className="num">− {money(discount)}</span>
              </div>
              <div className={s.grandTotal}>
                <span>Total cotizado</span>
                <span className="num">{money(total)}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {error && <Alert>{error}</Alert>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Button onClick={() => router.back()}>Cancelar</Button>
        <Button variant="primary" type="submit" loading={busy} disabled={!valid}>
          Guardar cotización
        </Button>
      </div>
    </form>
  );
}

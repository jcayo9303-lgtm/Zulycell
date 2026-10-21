"use client";

import { useEffect, useState, type FormEvent } from "react";
import s from "@/components/contacts/contacts.module.css";
import { Alert, Button, Combobox, Field, ImageUpload, Input, Modal, Select, Textarea } from "@/components/ui";
import { ProductLines, lineSubtotal, type Line } from "@/components/contacts/ProductLines";
import { parseSerials } from "@/components/inventory/types";
import type { SupplierRow } from "@/components/contacts/types";
import { api, ApiError } from "@/lib/api";
import { round2, todayIso } from "@/lib/format";
import { PAYMENT_METHODS, options } from "@/lib/labels";
import { useSession } from "@/lib/session";

const METHODS = options(PAYMENT_METHODS).map((o) => (o.value === "CREDIT" ? { ...o, label: "A crédito" } : o));

/** Registrar compra a proveedor (docs §12). Suma las unidades al inventario. */
export function PurchaseModal({
  open,
  onClose,
  onSaved,
  supplier,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  supplier?: { id: string; name: string } | null;
}) {
  const { money } = useSession();
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [method, setMethod] = useState("CASH");
  const [date, setDate] = useState(todayIso());
  const [invoiceRef, setInvoiceRef] = useState("");
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const [notes, setNotes] = useState("");
  // IMEI por línea (productos controlados por número de serie)
  const [serialText, setSerialText] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(supplier ?? null);
    setLines([]);
    setMethod("CASH");
    setDate(todayIso());
    setInvoiceRef("");
    setImage(null);
    setNotes("");
    setSerialText({});
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = round2(lines.reduce((a, l) => a + lineSubtotal(l, "purchase"), 0));
  const serialsOf = (key: string) => parseSerials(serialText[key] ?? "");
  const serialsOk = lines.every((l) => !l.serialized || serialsOf(l.key).length === Number(l.quantity));
  const valid = selected && lines.length > 0 && serialsOk && lines.every((l) => Number(l.quantity) > 0 && Number(l.price) > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/purchases", {
        supplierId: selected.id,
        items: lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          quantity: Number(l.quantity),
          unitCost: Number(l.price),
          ...(l.serialized ? { serials: serialsOf(l.key) } : {}),
        })),
        method,
        date,
        invoiceRef,
        invoiceImageKey: image?.key ?? null,
        notes,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar compra"
      width={860}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="purchase-form" loading={busy} disabled={!valid}>
            Guardar compra
          </Button>
        </>
      }
    >
      <form id="purchase-form" className="stack" onSubmit={submit}>
        <Field label="Proveedor" required>
          <Combobox<SupplierRow>
            value={selected?.name}
            onClear={supplier ? undefined : () => setSelected(null)}
            placeholder="Buscar proveedor"
            fetcher={(q) => api.get<{ items: SupplierRow[] }>("/suppliers", { q, pageSize: 20 }).then((r) => r.items)}
            onSelect={(x) => setSelected({ id: x.id, name: x.name })}
            renderItem={(x) => (
              <span>
                {x.name} {x.document && <span className="mono note">{x.document}</span>}
              </span>
            )}
          />
        </Field>

        <div className="section-title">Productos comprados</div>
        <ProductLines lines={lines} onChange={setLines} mode="purchase" />
        {lines
          .filter((l) => l.serialized)
          .map((l) => {
            const count = serialsOf(l.key).length;
            const expected = Number(l.quantity) || 0;
            return (
              <Field
                key={l.key}
                label={`IMEI de ${l.name}`}
                required
                hint={`Uno por línea o escaneados: ${count} de ${expected}`}
                error={count && count !== expected ? `Debes ingresar ${expected} IMEI (llevas ${count})` : undefined}
              >
                <Textarea
                  className="mono"
                  rows={3}
                  value={serialText[l.key] ?? ""}
                  onChange={(e) => setSerialText((p) => ({ ...p, [l.key]: e.target.value }))}
                />
              </Field>
            );
          })}

        <div className={s.totals}>
          <div className={s.grandTotal}>
            <span>Total</span>
            <span className="num">{money(total)}</span>
          </div>
        </div>

        <div className="grid-3">
          <Field label="Método de pago" required hint={method === "CREDIT" ? "Genera una cuenta por pagar" : undefined}>
            <Select value={method} onChange={(e) => setMethod(e.target.value)} options={METHODS} />
          </Field>
          <Field label="Fecha de la compra" required>
            <Input type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="N.º de factura / referencia">
            <Input className="mono" maxLength={50} value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} />
          </Field>
        </div>
        <Field label="Imagen de la factura">
          <ImageUpload url={image?.url ?? null} onChange={setImage} folder="purchases" label="Subir foto" />
        </Field>
        <Field label="Notas">
          <Textarea maxLength={255} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

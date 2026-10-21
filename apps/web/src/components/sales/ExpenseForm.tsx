"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Combobox, Field, ImageUpload, Input, Modal, Select, Textarea, Toggle, useToast } from "@/components/ui";
import { api, ApiError, type Paginated } from "@/lib/api";
import { EXPENSE_CATEGORIES, options } from "@/lib/labels";
import { UNIT_SHORT as UNIT_SHORT_LABEL } from "@/lib/format";
import type { Product } from "./types";

type SupplierLite = { id: string; name: string; phone: string | null };

const METHODS = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "QR", label: "QR" },
  { value: "WALLET", label: "Billetera móvil" },
  { value: "CREDIT", label: "A crédito" },
];

/** datetime-local de "ahora" en la hora del navegador */
const nowLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const EMPTY = {
  amount: "",
  category: "OTHER",
  description: "",
  method: "CASH",
  updatesInventory: false,
  quantity: "",
  date: nowLocal(),
};

export function ExpenseForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [supplier, setSupplier] = useState<SupplierLite | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [receipt, setReceipt] = useState<{ key: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isMerch = form.category === "MERCHANDISE";

  const close = () => {
    setForm({ ...EMPTY, date: nowLocal() });
    setSupplier(null);
    setProduct(null);
    setReceipt(null);
    setError(null);
    setFields({});
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const updatesInventory = isMerch && form.updatesInventory;
      await api.post("/expenses", {
        amount: form.amount,
        category: form.category,
        description: form.description,
        supplierId: supplier?.id ?? null,
        method: form.method || null,
        updatesInventory,
        productId: updatesInventory ? product?.id ?? null : null,
        quantity: updatesInventory ? form.quantity || null : null,
        date: new Date(form.date).toISOString(),
        receiptKey: receipt?.key ?? null,
      });
      toast("Gasto registrado");
      onSaved();
      close();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      } else setError("No se pudo guardar el gasto.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Registrar gasto"
      width={560}
      footer={
        <>
          <Button onClick={close}>Cancelar</Button>
          <Button variant="primary" type="submit" form="expense-form" loading={busy}>
            Guardar gasto
          </Button>
        </>
      }
    >
      <form id="expense-form" className="stack" onSubmit={submit}>
        <div className="grid-2">
          <Field label="Monto del gasto" required error={fields.amount}>
            <Input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              autoFocus
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </Field>
          <Field label="Categoría" required error={fields.category}>
            <Select value={form.category} onChange={(e) => set("category", e.target.value)} options={options(EXPENSE_CATEGORIES)} />
          </Field>
        </div>

        <Field label="Descripción / concepto" error={fields.description}>
          <Textarea maxLength={255} rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>

        <div className="grid-2">
          <Field label="Proveedor" error={fields.supplierId}>
            <Combobox<SupplierLite>
              value={supplier?.name}
              onClear={() => setSupplier(null)}
              placeholder="Buscar proveedor"
              fetcher={(q) => api.get<Paginated<SupplierLite>>("/suppliers", { q, pageSize: 10 }).then((r) => r.items)}
              renderItem={(s) => s.name}
              onSelect={setSupplier}
            />
          </Field>
          <Field label="Método de pago" error={fields.method}>
            <Select value={form.method} onChange={(e) => set("method", e.target.value)} options={METHODS} />
          </Field>
        </div>

        {isMerch && (
          <div className="stack" style={{ gap: 10 }}>
            <Toggle
              checked={form.updatesInventory}
              onChange={(v) => set("updatesInventory", v)}
              label="Sumar las unidades compradas al inventario"
            />
            {form.updatesInventory && (
              <div className="grid-2">
                <Field label="Producto" required error={fields.productId}>
                  <Combobox<Product>
                    value={product?.name}
                    onClear={() => setProduct(null)}
                    placeholder="Buscar en el catálogo"
                    fetcher={(q) => api.get<Paginated<Product>>("/products", { q, pageSize: 10 }).then((r) => r.items)}
                    renderItem={(p) => p.name}
                    onSelect={setProduct}
                  />
                </Field>
                <Field
                  label={`Cantidad comprada${product ? ` (${UNIT_SHORT_LABEL[product.unit] ?? ""})` : ""}`}
                  required
                  error={fields.quantity}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={product?.unit === "UNIT" ? 1 : 0.001}
                    step={product?.unit === "UNIT" ? 1 : 0.001}
                    value={form.quantity}
                    onChange={(e) => set("quantity", e.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        <Field label="Fecha del gasto" required error={fields.date}>
          <Input type="datetime-local" max={nowLocal()} value={form.date} onChange={(e) => set("date", e.target.value)} />
        </Field>

        <Field label="Comprobante / imagen">
          <ImageUpload url={receipt?.url ?? null} onChange={setReceipt} folder="expenses" label="Subir foto" />
        </Field>

        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

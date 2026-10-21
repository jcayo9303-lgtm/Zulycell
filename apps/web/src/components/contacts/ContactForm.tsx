"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Field, Input, Modal, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export type ContactValues = {
  name: string;
  phone: string;
  document: string;
  address: string;
  email: string;
  notes?: string;
};

const EMPTY: ContactValues = { name: "", phone: "", document: "", address: "", email: "" };

/** Formulario de cliente o proveedor (docs §9 y §11) */
export function ContactFormModal<T>({
  open,
  onClose,
  onSaved,
  endpoint,
  title,
  initial,
  withNotes,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (saved: T) => void;
  /** "/clients" o "/suppliers"; con id edita */
  endpoint: string;
  title: string;
  initial?: (Partial<Record<keyof ContactValues, string | null>> & { id?: string }) | null;
  withNotes?: boolean;
}) {
  const [values, setValues] = useState<ContactValues>(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFields({});
    setError(null);
    setValues({
      name: initial?.name ?? "",
      phone: initial?.phone ?? "",
      document: initial?.document ?? "",
      address: initial?.address ?? "",
      email: initial?.email ?? "",
      ...(withNotes ? { notes: initial?.notes ?? "" } : {}),
    });
  }, [open, initial, withNotes]);

  const set = (k: keyof ContactValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const saved = initial?.id ? await api.put<T>(`${endpoint}/${initial.id}`, values) : await api.post<T>(endpoint, values);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="contact-form" loading={busy} disabled={!values.name.trim()}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="contact-form" className="stack" onSubmit={submit}>
        <Field label="Nombre" required error={fields.name}>
          <Input autoFocus maxLength={100} value={values.name} onChange={set("name")} />
        </Field>
        <div className="grid-2">
          <Field label="Celular / teléfono" error={fields.phone}>
            <Input inputMode="tel" maxLength={20} value={values.phone} onChange={set("phone")} />
          </Field>
          <Field label="Documento" hint="CI, NIT, RUC, RUT…" error={fields.document}>
            <Input className="mono" maxLength={20} value={values.document} onChange={set("document")} />
          </Field>
        </div>
        <Field label="Dirección" error={fields.address}>
          <Input maxLength={255} value={values.address} onChange={set("address")} />
        </Field>
        <Field label="Email" error={fields.email}>
          <Input type="email" maxLength={254} value={values.email} onChange={set("email")} />
        </Field>
        {withNotes && (
          <Field label="Notas" error={fields.notes}>
            <Textarea maxLength={500} value={values.notes ?? ""} onChange={set("notes")} />
          </Field>
        )}
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

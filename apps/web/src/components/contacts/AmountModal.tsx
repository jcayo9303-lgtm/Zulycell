"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { PAYMENT_METHODS, options } from "@/lib/labels";
import { useSession } from "@/lib/session";

const METHODS = options(PAYMENT_METHODS).filter((o) => o.value !== "CREDIT");

/** Registrar deuda, abono o pago (docs §10 y §13) */
export function AmountModal({
  open,
  onClose,
  onSaved,
  title,
  endpoint,
  kind,
  max,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  title: string;
  endpoint: string;
  kind: "debt" | "payment";
  max?: number;
}) {
  const { money } = useSession();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [text, setText] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(kind === "payment" && max ? String(max) : "");
    setMethod("CASH");
    setText("");
    setFields({});
    setError(null);
  }, [open, kind, max]);

  const n = Number(amount);
  const tooHigh = kind === "payment" && max !== undefined && n > max;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(endpoint, kind === "debt" ? { amount: n, description: text } : { amount: n, method, notes: text });
      onSaved();
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
      width={420}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="amount-form" loading={busy} disabled={!(n > 0) || tooHigh}>
            Registrar
          </Button>
        </>
      }
    >
      <form id="amount-form" className="stack" onSubmit={submit}>
        <Field
          label="Monto"
          required
          hint={kind === "payment" && max !== undefined ? `Saldo pendiente: ${money(max)}` : undefined}
          error={tooHigh ? "No puede superar el saldo pendiente" : fields.amount}
        >
          <Input autoFocus type="number" min="0.01" step="0.01" className="num" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {kind === "payment" && (
          <Field label="Método de pago">
            <Select value={method} onChange={(e) => setMethod(e.target.value)} options={METHODS} />
          </Field>
        )}
        <Field label={kind === "debt" ? "Descripción" : "Notas"} error={fields.description ?? fields.notes}>
          <Textarea maxLength={255} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

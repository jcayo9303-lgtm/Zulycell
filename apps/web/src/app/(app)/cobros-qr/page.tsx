"use client";

import { useState, type FormEvent } from "react";
import { Copy, MessageCircle, QrCode } from "lucide-react";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, useToast } from "@/components/ui";
import { QrImage } from "@/components/QrImage";
import { api, ApiError } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";

type PaymentRequest = {
  id: string;
  token: string;
  amount: number | null;
  description: string | null;
  status: "PENDING" | "PAID" | "CANCELLED";
  createdAt: string;
  paidAt: string | null;
  url: string;
};

const STATUS = {
  PENDING: { label: "Pendiente", tone: "warning" },
  PAID: { label: "Pagado", tone: "success" },
  CANCELLED: { label: "Cancelado", tone: undefined },
} as const;

export default function PaymentQrPage() {
  const { me, money } = useSession();
  const toast = useToast();
  const list = useFetch(() => api.get<PaymentRequest[]>("/payment-requests"), []);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<PaymentRequest | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<PaymentRequest>("/payment-requests", {
        amount: amount.trim() === "" ? null : Number(amount),
        description,
      });
      setAmount("");
      setDescription("");
      setShown(created);
      void list.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar el cobro");
    } finally {
      setBusy(false);
    }
  }

  async function action(p: PaymentRequest, kind: "paid" | "cancel") {
    try {
      await api.post(`/payment-requests/${p.id}/${kind}`);
      toast(kind === "paid" ? "Cobro marcado como pagado" : "Cobro cancelado");
      void list.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo actualizar", true);
    }
  }

  const shareText = (p: PaymentRequest) =>
    `${me.business.name} te envía un cobro${p.amount ? ` por ${money(p.amount)}` : ""}${p.description ? ` (${p.description})` : ""}: ${p.url}`;

  return (
    <>
      <PageHeader title="QR de pago" subtitle="Genera un QR o enlace para que tus clientes te paguen" />

      <div className="grid-2" style={{ alignItems: "start", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.6fr)" }}>
        <Card title="Nuevo cobro">
          <form className="stack" onSubmit={create}>
            <Field label={`Monto a cobrar (${me.business.currencySymbol})`} hint="Si lo dejas vacío, el cliente ingresa el monto">
              <Input type="number" min={0.01} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Descripción del cobro" hint={`${description.length}/255`}>
              <Input maxLength={255} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" variant="primary" icon={<QrCode size={14} />} loading={busy}>
              Generar QR
            </Button>
          </form>
        </Card>

        <Card title="Cobros generados" flush>
          {list.loading && !list.data ? (
            <Loading />
          ) : list.error ? (
            <div style={{ padding: 16 }}>
              <Alert>{list.error}</Alert>
            </div>
          ) : !list.data?.length ? (
            <Empty title="Sin cobros">Los QR que generes aparecerán aquí.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Descripción</th>
                    <th className="num">Monto</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDateTime(p.createdAt, me.business.timezone)}</td>
                      <td className="muted">{p.description ?? "—"}</td>
                      <td className="num">{p.amount != null ? money(p.amount) : <span className="note">Libre</span>}</td>
                      <td>
                        <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                      </td>
                      <td className="num">
                        <div className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                          <Button size="sm" variant="ghost" onClick={() => setShown(p)}>
                            Ver QR
                          </Button>
                          {p.status === "PENDING" && (
                            <>
                              <Button size="sm" onClick={() => action(p, "paid")}>
                                Marcar pagado
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => action(p, "cancel")}>
                                Cancelar
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {shown && (
        <Modal open onClose={() => setShown(null)} title="QR de pago" width={380}>
          <div className="stack" style={{ alignItems: "center", textAlign: "center" }}>
            <div className="card-title">{shown.amount != null ? money(shown.amount) : "Monto libre"}</div>
            {shown.description && <div className="muted">{shown.description}</div>}
            <QrImage value={shown.url} size={220} downloadName={`cobro-${shown.token.slice(0, 8)}`} />
            <code className="note" style={{ wordBreak: "break-all" }}>
              {shown.url}
            </code>
            <div className="row wrap" style={{ justifyContent: "center" }}>
              <Button size="sm" icon={<Copy size={14} />} onClick={() => navigator.clipboard.writeText(shown.url).then(() => toast("Enlace copiado"))}>
                Copiar enlace
              </Button>
              <Button
                size="sm"
                icon={<MessageCircle size={14} />}
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText(shown))}`, "_blank", "noopener")}
              >
                Compartir
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

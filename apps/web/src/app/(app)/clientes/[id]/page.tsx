"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import s from "@/components/contacts/contacts.module.css";
import { Alert, Badge, Button, Card, Empty, Kpi, Loading, PageHeader, Tabs, useConfirm, useToast } from "@/components/ui";
import { ContactFormModal } from "@/components/contacts/ContactForm";
import { AmountModal } from "@/components/contacts/AmountModal";
import { LedgerTable } from "@/components/contacts/LedgerTable";
import type { ClientRow, Movement } from "@/components/contacts/types";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtDate, fmtDateTime, fmtSeq } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/labels";
import { useSession } from "@/lib/session";

type ClientDetail = ClientRow & {
  totalPurchased: number;
  salesCount: number;
  sales: { id: string; number: number; total: number; method: PaymentMethod; status: "COMPLETED" | "VOIDED"; createdAt: string }[];
};

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { money, can, me } = useSession();
  const [tab, setTab] = useState<"movements" | "sales">("movements");
  const [modal, setModal] = useState<"edit" | "debt" | "payment" | null>(null);

  const client = useFetch(() => api.get<ClientDetail>(`/clients/${id}`), [id]);
  const movements = useFetch(() => api.get<Movement[]>(`/clients/${id}/movements`), [id]);
  const reload = () => Promise.all([client.reload(), movements.reload()]);
  const canEdit = can("clients_edit");

  if (client.error) return <Alert>{client.error}</Alert>;
  if (!client.data) return <Loading />;
  const c = client.data;

  const remind = async () => {
    try {
      const r = await api.get<{ url: string }>(`/clients/${id}/reminder`);
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo generar el recordatorio", true);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar a ${c.name}? Su historial se conserva en los reportes.`)) return;
    await api.del(`/clients/${id}`);
    toast("Cliente eliminado");
    router.push("/clientes");
  };

  const afterSave = (msg: string) => {
    setModal(null);
    toast(msg);
    void reload();
  };

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={<Link href="/clientes"><ArrowLeft size={12} /> Volver a clientes</Link>}
        actions={
          canEdit && (
            <>
              <Button onClick={() => setModal("debt")}>Registrar deuda</Button>
              <Button variant="primary" disabled={c.balance <= 0} onClick={() => setModal("payment")}>
                Registrar abono
              </Button>
              <Button icon={<MessageCircle size={14} />} disabled={!c.phone} onClick={remind}>
                Enviar recordatorio
              </Button>
            </>
          )
        }
      />

      <div className="stack">
        <div className="kpi-grid">
          <Kpi label="Deuda actual" value={money(c.balance)} tone={c.balance > 0 ? "danger" : "success"} />
          <Kpi label="Total comprado" value={money(c.totalPurchased)} foot={`${c.salesCount} ventas`} />
          <Kpi label="Cliente desde" value={fmtDate(c.createdAt, me.business.timezone)} />
        </div>

        <div className={s.detailGrid}>
          <Card
            title="Datos del cliente"
            actions={
              canEdit && (
                <>
                  <Button size="sm" onClick={() => setModal("edit")}>
                    Editar
                  </Button>
                  <Button size="sm" variant="danger" onClick={remove}>
                    Eliminar
                  </Button>
                </>
              )
            }
          >
            <dl className={s.dl}>
              <dt>Celular</dt>
              <dd>{c.phone ?? "—"}</dd>
              <dt>Documento</dt>
              <dd className="mono">{c.document ?? "—"}</dd>
              <dt>Dirección</dt>
              <dd>{c.address ?? "—"}</dd>
              <dt>Email</dt>
              <dd>{c.email ?? "—"}</dd>
            </dl>
          </Card>

          <Card flush>
            <div style={{ padding: "0 8px" }}>
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "movements", label: "Deudas y abonos" },
                  { value: "sales", label: `Compras (${c.salesCount})` },
                ]}
              />
            </div>
            {tab === "movements" ? (
              movements.data ? (
                <LedgerTable movements={movements.data} debtLabel="Deuda" paymentLabel="Abono" />
              ) : (
                <Loading />
              )
            ) : !c.sales.length ? (
              <Empty title="Sin compras registradas" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>N.º</th>
                      <th>Fecha</th>
                      <th>Método</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.sales.map((sale) => (
                      <tr key={sale.id}>
                        <td className="mono">{fmtSeq(sale.number)}</td>
                        <td className="muted">{fmtDateTime(sale.createdAt, me.business.timezone)}</td>
                        <td>
                          {PAYMENT_METHODS[sale.method]} {sale.status === "VOIDED" && <Badge tone="danger">Anulada</Badge>}
                        </td>
                        <td className="num">{money(sale.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      <ContactFormModal<ClientRow>
        open={modal === "edit"}
        onClose={() => setModal(null)}
        endpoint="/clients"
        title="Editar cliente"
        initial={c}
        onSaved={() => afterSave("Cliente actualizado")}
      />
      <AmountModal
        open={modal === "debt"}
        onClose={() => setModal(null)}
        onSaved={() => afterSave("Deuda registrada")}
        title="Registrar deuda"
        endpoint={`/clients/${id}/debts`}
        kind="debt"
      />
      <AmountModal
        open={modal === "payment"}
        onClose={() => setModal(null)}
        onSaved={() => afterSave("Abono registrado")}
        title="Registrar abono"
        endpoint={`/clients/${id}/payments`}
        kind="payment"
        max={c.balance}
      />
    </>
  );
}

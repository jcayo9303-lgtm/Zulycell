"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, PackagePlus } from "lucide-react";
import s from "@/components/contacts/contacts.module.css";
import { Alert, Button, Card, Empty, Kpi, Loading, PageHeader, Tabs, useConfirm, useToast } from "@/components/ui";
import { ContactFormModal } from "@/components/contacts/ContactForm";
import { AmountModal } from "@/components/contacts/AmountModal";
import { LedgerTable } from "@/components/contacts/LedgerTable";
import { docDate } from "@/components/contacts/PrintDocument";
import type { Movement, SupplierRow } from "@/components/contacts/types";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtNumber } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { PurchaseModal } from "../PurchaseModal";

type Purchase = {
  id: string;
  total: number;
  method: PaymentMethod;
  date: string;
  invoiceRef: string | null;
  invoiceImageUrl: string | null;
  notes: string | null;
  items: { id: string; name: string; quantity: number; unitCost: number; subtotal: number }[];
};

type SupplierDetail = SupplierRow & { purchases: Purchase[]; movements: Movement[] };

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { money } = useSession();
  const [tab, setTab] = useState<"purchases" | "movements">("purchases");
  const [modal, setModal] = useState<"edit" | "payment" | "purchase" | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, error, reload } = useFetch(() => api.get<SupplierDetail>(`/suppliers/${id}`), [id]);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;

  const remove = async () => {
    if (!confirm(`¿Eliminar a ${data.name}?`)) return;
    await api.del(`/suppliers/${id}`);
    toast("Proveedor eliminado");
    router.push("/proveedores");
  };

  const afterSave = (msg: string) => {
    setModal(null);
    toast(msg);
    void reload();
  };

  const totalPurchased = data.purchases.reduce((a, p) => a + p.total, 0);

  return (
    <>
      <PageHeader
        title={data.name}
        subtitle={<Link href="/proveedores"><ArrowLeft size={12} /> Volver a proveedores</Link>}
        actions={
          <>
            <Button icon={<PackagePlus size={14} />} onClick={() => setModal("purchase")}>
              Registrar compra
            </Button>
            <Button variant="primary" disabled={data.balance <= 0} onClick={() => setModal("payment")}>
              Registrar pago
            </Button>
          </>
        }
      />

      <div className="stack">
        <div className="kpi-grid">
          <Kpi label="Saldo por pagar" value={money(data.balance)} tone={data.balance > 0 ? "danger" : "success"} />
          <Kpi label="Compras recientes" value={money(totalPurchased)} foot={`${data.purchases.length} compras`} />
        </div>

        <div className={s.detailGrid}>
          <Card
            title="Datos del proveedor"
            actions={
              <>
                <Button size="sm" onClick={() => setModal("edit")}>
                  Editar
                </Button>
                <Button size="sm" variant="danger" onClick={remove}>
                  Eliminar
                </Button>
              </>
            }
          >
            <dl className={s.dl}>
              <dt>Celular</dt>
              <dd>{data.phone ?? "—"}</dd>
              <dt>Documento</dt>
              <dd className="mono">{data.document ?? "—"}</dd>
              <dt>Dirección</dt>
              <dd>{data.address ?? "—"}</dd>
              <dt>Email</dt>
              <dd>{data.email ?? "—"}</dd>
              <dt>Notas</dt>
              <dd>{data.notes ?? "—"}</dd>
            </dl>
          </Card>

          <Card flush>
            <div style={{ padding: "0 8px" }}>
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "purchases", label: "Compras" },
                  { value: "movements", label: "Cuenta por pagar" },
                ]}
              />
            </div>
            {tab === "movements" ? (
              <LedgerTable movements={data.movements} debtLabel="Compra a crédito" paymentLabel="Pago" />
            ) : !data.purchases.length ? (
              <Empty title="Sin compras registradas" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Factura</th>
                      <th>Método</th>
                      <th className="num">Ítems</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.purchases.map((p) => (
                      <Fragment key={p.id}>
                        <tr className="clickable" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                          <td>{docDate(p.date)}</td>
                          <td className="mono muted">{p.invoiceRef ?? "—"}</td>
                          <td>{p.method === "CREDIT" ? "A crédito" : PAYMENT_METHODS[p.method]}</td>
                          <td className="num">{p.items.length}</td>
                          <td className="num">{money(p.total)}</td>
                        </tr>
                        {expanded === p.id && (
                          <tr>
                            <td colSpan={5} style={{ background: "var(--surface-2)" }}>
                              <div className="stack" style={{ gap: 4 }}>
                                {p.items.map((i) => (
                                  <div key={i.id} className="row-between">
                                    <span>
                                      {i.name} <span className="note">× {fmtNumber(i.quantity, Number.isInteger(i.quantity) ? 0 : 3)} a {money(i.unitCost)}</span>
                                    </span>
                                    <span className="num">{money(i.subtotal)}</span>
                                  </div>
                                ))}
                                {p.notes && <div className="note">{p.notes}</div>}
                                {p.invoiceImageUrl && (
                                  <a href={p.invoiceImageUrl} target="_blank" rel="noopener noreferrer">
                                    Ver imagen de la factura
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      <ContactFormModal<SupplierRow>
        open={modal === "edit"}
        onClose={() => setModal(null)}
        endpoint="/suppliers"
        title="Editar proveedor"
        initial={data}
        withNotes
        onSaved={() => afterSave("Proveedor actualizado")}
      />
      <AmountModal
        open={modal === "payment"}
        onClose={() => setModal(null)}
        onSaved={() => afterSave("Pago registrado")}
        title="Registrar pago"
        endpoint={`/suppliers/${id}/payments`}
        kind="payment"
        max={data.balance}
      />
      <PurchaseModal
        open={modal === "purchase"}
        supplier={{ id: data.id, name: data.name }}
        onClose={() => setModal(null)}
        onSaved={() => afterSave("Compra registrada y stock actualizado")}
      />
    </>
  );
}

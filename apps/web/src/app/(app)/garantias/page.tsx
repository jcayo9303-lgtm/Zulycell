"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ShieldCheck, Wrench } from "lucide-react";
import s from "./garantias.module.css";
import { Alert, Badge, Button, Card, Empty, Loading, Modal, PageHeader, SearchInput } from "@/components/ui";
import { Receipt } from "@/components/sales/Receipt";
import type { SaleDetail } from "@/components/sales/types";
import { SERIAL_STATUS, type SerialRow } from "@/components/inventory/types";
import { api, ApiError } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtSeq } from "@/lib/format";
import { REPAIR_STATUS, type RepairStatus } from "@/lib/labels";
import { useSession } from "@/lib/session";

type ClientLite = { id: string; name: string; phone: string | null };

type SaleResult = {
  kind: "sale";
  key: string;
  saleId: string;
  saleNumber: number;
  saleDate: string;
  saleStatus: "COMPLETED" | "VOIDED";
  client: ClientLite | null;
  productId: string | null;
  productName: string;
  serial: string | null;
  serialStatus: SerialRow["status"] | null;
  warrantyUntil: string | null;
  inWarranty: boolean | null;
};

type StockResult = {
  kind: "stock";
  key: string;
  serial: string;
  serialStatus: SerialRow["status"];
  productId: string;
  productName: string;
  brand: string | null;
  createdAt: string;
};

type RepairResult = {
  id: string;
  number: number;
  status: RepairStatus;
  deviceType: string;
  brand: string;
  model: string;
  imei: string | null;
  client: ClientLite;
  createdAt: string;
  deliveredAt: string | null;
  warrantyDays: number;
  warrantyUntil: string | null;
  inWarranty: boolean | null;
};

type SearchResult = { items: SaleResult[]; stock: StockResult[]; repairs: RepairResult[] };

function WarrantyBadge({ until, inWarranty, voided }: { until: string | null; inWarranty: boolean | null; voided?: boolean }) {
  if (voided) return <Badge tone="danger">Venta anulada</Badge>;
  if (!until) return <Badge>Sin garantía</Badge>;
  return inWarranty ? (
    <Badge tone="success">En garantía hasta {fmtDate(until)}</Badge>
  ) : (
    <Badge tone="warning">Garantía vencida el {fmtDate(until)}</Badge>
  );
}

export default function WarrantyPage() {
  const { me, can } = useSession();
  const tz = me.business.timezone;
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sale, setSale] = useState<SaleDetail | null>(null);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.get<SearchResult>("/warranty/search", { q: term }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo buscar");
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const openSale = async (id: string) => {
    try {
      setSale(await api.get<SaleDetail>(`/sales/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo abrir la venta");
    }
  };

  const repairHref = (imei: string | null, clientId?: string | null) => {
    const params = new URLSearchParams();
    if (imei) params.set("imei", imei);
    if (clientId) params.set("clientId", clientId);
    return `/reparaciones/nueva?${params.toString()}`;
  };

  const empty = result && !result.items.length && !result.stock.length && !result.repairs.length;

  return (
    <>
      <PageHeader title="Garantías e IMEI" subtitle="Consulta si un equipo o accesorio vendido sigue en garantía" />

      <Card>
        <form className={s.searchBox} onSubmit={search}>
          <div className="grow">
            <SearchInput
              autoFocus
              className={s.searchInput}
              placeholder="IMEI o número de serie, n.º de venta, nombre o celular del cliente"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={q.trim().length < 2} icon={<ShieldCheck size={16} />}>
            Buscar
          </Button>
        </form>
        <p className="note" style={{ marginTop: 8 }}>
          El IMEI se ve marcando *#06# en el equipo o en la caja. La garantía se calcula desde la fecha de venta con los días
          configurados en cada producto.
        </p>
      </Card>

      <div className="stack" style={{ marginTop: 16 }}>
        {error && <Alert>{error}</Alert>}
        {busy && <Loading />}
        {empty && (
          <Card>
            <Empty
              title="Sin resultados"
              action={
                can("repairs_edit") && (
                  <Link href={repairHref(/^[A-Za-z0-9-]{4,30}$/.test(q.trim()) ? q.trim() : null)}>
                    <Button icon={<Wrench size={14} />}>Abrir reparación</Button>
                  </Link>
                )
              }
            >
              No encontramos ventas, IMEI ni reparaciones con «{q}».
            </Empty>
          </Card>
        )}

        {result && result.items.length > 0 && (
          <Card title={`Ventas (${result.items.length})`} flush>
            <div className={s.results}>
              {result.items.map((r) => (
                <div key={r.key} className={s.result}>
                  <div className={s.resultMain}>
                    <div className={s.resultTitle}>{r.productName}</div>
                    {r.serial && (
                      <div className="note">
                        IMEI <span className="mono">{r.serial}</span>
                        {r.serialStatus && r.serialStatus !== "SOLD" && ` · ${SERIAL_STATUS[r.serialStatus]}`}
                      </div>
                    )}
                    <div className="note">
                      Venta <span className="mono">#{fmtSeq(r.saleNumber)}</span> · {fmtDateTime(r.saleDate, tz)}
                      {r.client && ` · ${r.client.name}${r.client.phone ? ` (${r.client.phone})` : ""}`}
                    </div>
                  </div>
                  <div className={s.resultSide}>
                    <WarrantyBadge until={r.warrantyUntil} inWarranty={r.inWarranty} voided={r.saleStatus === "VOIDED"} />
                    <div className="row">
                      <Button size="sm" onClick={() => openSale(r.saleId)}>
                        Ver venta
                      </Button>
                      {can("repairs_edit") && (
                        <Link href={repairHref(r.serial, r.client?.id)}>
                          <Button size="sm" icon={<Wrench size={13} />}>
                            Abrir reparación
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {result && result.stock.length > 0 && (
          <Card title="IMEI sin venta registrada" flush>
            <div className={s.results}>
              {result.stock.map((r) => (
                <div key={r.key} className={s.result}>
                  <div className={s.resultMain}>
                    <div className={s.resultTitle}>{r.productName}</div>
                    <div className="note">
                      IMEI <span className="mono">{r.serial}</span> · ingresó {fmtDateTime(r.createdAt, tz)}
                    </div>
                  </div>
                  <div className={s.resultSide}>
                    <Badge tone={r.serialStatus === "IN_STOCK" ? "info" : "danger"}>{SERIAL_STATUS[r.serialStatus]}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {result && result.repairs.length > 0 && (
          <Card title={`Reparaciones (${result.repairs.length})`} flush>
            <div className={s.results}>
              {result.repairs.map((r) => (
                <div key={r.id} className={s.result}>
                  <div className={s.resultMain}>
                    <div className={s.resultTitle}>
                      {r.deviceType} {r.brand} {r.model}
                    </div>
                    <div className="note">
                      Orden <span className="mono">#{fmtSeq(r.number)}</span> · {REPAIR_STATUS[r.status]} · {r.client.name}
                      {r.imei && (
                        <>
                          {" "}
                          · IMEI <span className="mono">{r.imei}</span>
                        </>
                      )}
                    </div>
                    <div className="note">
                      Recibido {fmtDateTime(r.createdAt, tz)}
                      {r.deliveredAt && ` · entregado ${fmtDateTime(r.deliveredAt, tz)}`}
                    </div>
                  </div>
                  <div className={s.resultSide}>
                    {r.status === "DELIVERED" ? (
                      <WarrantyBadge until={r.warrantyUntil} inWarranty={r.inWarranty} />
                    ) : (
                      <Badge tone="info">{REPAIR_STATUS[r.status]}</Badge>
                    )}
                    <Link href={`/reparaciones/${r.id}`}>
                      <Button size="sm">Ver orden</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Modal open={Boolean(sale)} onClose={() => setSale(null)} title={sale ? `Venta #${fmtSeq(sale.number)}` : ""} width={440}>
        {sale && <Receipt sale={sale} />}
      </Modal>
    </>
  );
}

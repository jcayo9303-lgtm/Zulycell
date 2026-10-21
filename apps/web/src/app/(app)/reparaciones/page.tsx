"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus } from "lucide-react";
import s from "@/components/repairs/repairs.module.css";
import { Alert, Button, Card, Empty, Field, Input, Kpi, Loading, PageHeader, Pager, SearchInput } from "@/components/ui";
import { StatusBadge } from "@/components/repairs/StatusBadge";
import { isOverdue, type RepairList } from "@/components/repairs/types";
import { api } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { fmtDate, fmtDateTime, fmtSeq } from "@/lib/format";
import { REPAIR_STATUS, type RepairStatus } from "@/lib/labels";

const OPEN = "RECEIVED,DIAGNOSING,WAITING_PARTS,REPAIRING";

type Filter = { key: string; label: string; status: string };

const FILTERS: Filter[] = [
  { key: "open", label: "En taller", status: OPEN },
  { key: "READY", label: REPAIR_STATUS.READY, status: "READY" },
  ...(["RECEIVED", "DIAGNOSING", "WAITING_PARTS", "REPAIRING", "DELIVERED", "UNREPAIRABLE", "CANCELLED"] as RepairStatus[]).map(
    (st) => ({ key: st, label: REPAIR_STATUS[st], status: st }),
  ),
  { key: "all", label: "Todas", status: "" },
];

export default function RepairsPage() {
  const router = useRouter();
  const { me, money, can } = useSession();
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(q, 250);

  const status = FILTERS.find((f) => f.key === filter)?.status ?? "";
  const query = { status, q: debounced, from, to, page, pageSize: 30 };
  const list = useFetch(() => api.get<RepairList>("/repairs", query), [status, debounced, from, to, page]);

  const counts = list.data?.counts;
  const countFor = (f: Filter) =>
    counts ? (f.status ? f.status.split(",").reduce((a, st) => a + (counts[st as RepairStatus] ?? 0), 0) : Object.values(counts).reduce((a, b) => a + b, 0)) : null;

  const tz = me.business.timezone;
  const stats = list.data?.stats;

  return (
    <>
      <PageHeader
        title="Reparaciones"
        subtitle="Órdenes de servicio técnico: recepción, diagnóstico, repuestos, cobro y entrega"
        actions={
          <>
            <a href={api.url("/repairs/export.xlsx", { status, q: debounced, from, to })} download>
              <Button icon={<Download size={14} />}>Descargar Excel</Button>
            </a>
            {can("repairs_edit") && (
              <Link href="/reparaciones/nueva">
                <Button variant="primary" icon={<Plus size={14} />}>
                  Nueva orden
                </Button>
              </Link>
            )}
          </>
        }
      />

      <div className="stack">
        <div className="kpi-grid">
          <Kpi label="En taller" value={stats?.inShop ?? "—"} foot="Recibidos, en diagnóstico o reparación" />
          <Kpi label="Listos para entregar" value={stats?.ready ?? "—"} tone={stats?.ready ? "success" : undefined} />
          <Kpi label="Entregados este mes" value={stats?.deliveredMonth ?? "—"} />
          <Kpi label="Por cobrar" value={stats ? money(stats.receivable) : "—"} tone={stats?.receivable ? "danger" : undefined} />
        </div>

        <div className={s.chips}>
          {FILTERS.map((f) => {
            const n = countFor(f);
            return (
              <button
                key={f.key}
                type="button"
                className={`${s.chip} ${filter === f.key ? s.chipActive : ""}`}
                onClick={() => {
                  setFilter(f.key);
                  setPage(1);
                }}
              >
                {f.label}
                {n !== null && <span className={s.chipCount}>{n}</span>}
              </button>
            );
          })}
        </div>

        <Card flush>
          <div className={s.filters}>
            <div className={s.search}>
              <SearchInput
                placeholder="Buscar por N.º, cliente, celular, marca, modelo o IMEI"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Field label="Desde">
              <Input type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} />
            </Field>
          </div>

          {list.error && (
            <div style={{ padding: 16 }}>
              <Alert>{list.error}</Alert>
            </div>
          )}
          {list.loading && !list.data ? (
            <Loading />
          ) : !list.data?.items.length ? (
            <Empty title="No hay órdenes de reparación">
              {filter === "open" ? "No hay equipos en el taller." : "Prueba con otros filtros."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>N.º</th>
                    <th>Recibido</th>
                    <th>Cliente</th>
                    <th>Equipo</th>
                    <th>IMEI</th>
                    <th>Estado</th>
                    <th>Técnico</th>
                    <th className="num">Total</th>
                    <th className="num">Saldo</th>
                    <th>Prometido</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((r) => {
                    const overdue = isOverdue(r);
                    return (
                      <tr key={r.id} className="clickable" onClick={() => router.push(`/reparaciones/${r.id}`)}>
                        <td className="mono">{fmtSeq(r.number)}</td>
                        <td>{fmtDate(r.createdAt, tz)}</td>
                        <td>
                          <div>{r.client.name}</div>
                          {r.client.phone && <div className={s.cellSub}>{r.client.phone}</div>}
                        </td>
                        <td>
                          <div>
                            {r.brand} {r.model}
                          </div>
                          <div className={s.cellSub}>{r.reportedIssue}</div>
                        </td>
                        <td className="mono">{r.imei ?? "—"}</td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td>{r.technicianName ?? <span className="note">Sin asignar</span>}</td>
                        <td className="num">{money(r.total)}</td>
                        <td className={`num ${r.balance > 0 ? "text-danger" : ""}`}>{money(r.balance)}</td>
                        <td className={overdue ? "text-danger" : undefined}>
                          {r.promisedAt ? fmtDateTime(r.promisedAt, tz) : "—"}
                          {overdue && <div className={s.cellSub}>Vencida</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {list.data && <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />}
        </Card>
      </div>
    </>
  );
}

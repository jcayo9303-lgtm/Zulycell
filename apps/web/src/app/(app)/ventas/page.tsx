"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { TimeChart } from "@/components/charts";
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Kpi,
  Loading,
  Modal,
  PageHeader,
  Pager,
  SearchInput,
  Segmented,
  Select,
  Tabs,
  useConfirm,
  useToast,
} from "@/components/ui";
import { PeriodFilter, usePeriod } from "@/components/sales/PeriodFilter";
import { Receipt } from "@/components/sales/Receipt";
import type { IncomeData, SaleDetail, SalesPage } from "@/components/sales/types";
import { api, ApiError } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/hooks";
import { fmtDate, fmtDateTime, fmtSeq } from "@/lib/format";
import { PAYMENT_METHODS, options } from "@/lib/labels";
import { useSession } from "@/lib/session";

type Employee = { userId: string; name: string };

const PAGE_SIZE = 30;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export default function SalesHistoryPage() {
  const { can } = useSession();
  const showIncome = can("stats_view", "balance_view");
  const [tab, setTab] = useState<"sales" | "income">("sales");

  return (
    <>
      <PageHeader title="Ventas e ingresos" subtitle="Historial de ventas y de todo el dinero que entra y sale del negocio" />
      {showIncome && (
        <div style={{ marginBottom: 16 }}>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "sales", label: "Historial de ventas" },
              { value: "income", label: "Ingresos y egresos" },
            ]}
          />
        </div>
      )}
      {tab === "sales" ? <SalesTab /> : <IncomeTab />}
    </>
  );
}

function SalesTab() {
  const { me, money, isOwner } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const tz = me.business.timezone;

  const period = usePeriod("month");
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const [receipt, setReceipt] = useState<SaleDetail | null>(null);
  const [voiding, setVoiding] = useState(false);
  const search = useDebounced(q, 300);

  const query = { ...period.query, q: search, method, status, userId };
  const key = JSON.stringify(query);
  const sales = useFetch(() => api.get<SalesPage>("/sales", { ...query, page, pageSize: PAGE_SIZE }), [key, page]);
  const employees = useFetch(() => (isOwner ? api.get<Employee[]>("/employees").catch(() => []) : Promise.resolve([])), []);

  const resetPage = () => setPage(1);

  const openSale = async (id: string) => {
    try {
      setReceipt(await api.get<SaleDetail>(`/sales/${id}`));
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo abrir la venta", true);
    }
  };

  const voidSale = async () => {
    if (!receipt || !confirm(`¿Anular la venta #${fmtSeq(receipt.number)}? El stock se devolverá al inventario.`)) return;
    setVoiding(true);
    try {
      await api.post(`/sales/${receipt.id}/void`);
      toast("Venta anulada");
      setReceipt(await api.get<SaleDetail>(`/sales/${receipt.id}`));
      void sales.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo anular", true);
    } finally {
      setVoiding(false);
    }
  };

  const sm = sales.data?.summary;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card>
        <div className="stack">
          <div className="row-between wrap">
            <PeriodFilter state={period} onChange={resetPage} />
            <a href={api.url("/sales/export.xlsx", query)} download>
              <Button icon={<Download size={14} />}>Descargar Excel</Button>
            </a>
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <Field label="Buscar">
              <SearchInput
                placeholder="#número, cliente, producto o IMEI"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  resetPage();
                }}
              />
            </Field>
            <Field label="Método de pago">
              <Select
                value={method}
                placeholder="Todos"
                options={options(PAYMENT_METHODS)}
                onChange={(e) => {
                  setMethod(e.target.value);
                  resetPage();
                }}
              />
            </Field>
            <Field label="Estado">
              <Select
                value={status}
                placeholder="Todas"
                options={[
                  { value: "COMPLETED", label: "Completadas" },
                  { value: "VOIDED", label: "Anuladas" },
                ]}
                onChange={(e) => {
                  setStatus(e.target.value);
                  resetPage();
                }}
              />
            </Field>
            {(employees.data?.length ?? 0) > 0 && (
              <Field label="Vendedor">
                <Select
                  value={userId}
                  placeholder="Todos"
                  options={employees.data!.map((e) => ({ value: e.userId, label: e.name }))}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    resetPage();
                  }}
                />
              </Field>
            )}
          </div>
        </div>
      </Card>

      <div className="kpi-grid">
        <Kpi label={status === "VOIDED" ? "Total anulado" : "Total vendido"} value={sm ? money(sm.total) : "—"} />
        <Kpi label="Ventas" value={sm ? sm.count : "—"} />
        <Kpi label="Ticket promedio" value={sm ? money(sm.avgTicket) : "—"} />
        <Kpi label="Utilidad bruta" value={sm ? money(sm.profit) : "—"} foot="Total − costo de los productos" />
      </div>

      {sales.error && <Alert>{sales.error}</Alert>}
      <Card flush>
        {sales.loading && !sales.data ? (
          <Loading />
        ) : !sales.data?.items.length ? (
          <Empty title="No hay ventas con estos filtros" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th>Vendedor</th>
                    <th>Método</th>
                    <th className="num">Ítems</th>
                    <th className="num">Total</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.data.items.map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => openSale(s.id)}>
                      <td>{fmtDateTime(s.createdAt, tz)}</td>
                      <td className="mono">#{fmtSeq(s.number)}</td>
                      <td>{s.client?.name ?? <span className="muted">—</span>}</td>
                      <td>{s.seller ?? <span className="muted">—</span>}</td>
                      <td>{PAYMENT_METHODS[s.method]}</td>
                      <td className="num">{s._count.items}</td>
                      <td className="num" style={s.status === "VOIDED" ? { textDecoration: "line-through" } : undefined}>
                        {money(s.total)}
                      </td>
                      <td>{s.status === "VOIDED" ? <Badge tone="danger">Anulada</Badge> : <Badge tone="success">Completada</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} total={sales.data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal open={Boolean(receipt)} onClose={() => setReceipt(null)} title="Comprobante de venta" width={440}>
        {receipt && (
          <Receipt
            sale={receipt}
            actions={
              isOwner &&
              receipt.status === "COMPLETED" && (
                <Button variant="danger" loading={voiding} onClick={voidSale}>
                  Anular venta
                </Button>
              )
            }
          />
        )}
      </Modal>
    </div>
  );
}

const COLUMNS: { key: keyof IncomeData["totals"]; label: string; strong?: boolean; tone?: "in" | "out" }[] = [
  { key: "sales", label: "Ventas al contado", tone: "in" },
  { key: "repairs", label: "Reparaciones", tone: "in" },
  { key: "clientPayments", label: "Abonos de clientes", tone: "in" },
  { key: "income", label: "Total ingresos", strong: true },
  { key: "expenses", label: "Gastos", tone: "out" },
  { key: "purchases", label: "Compras", tone: "out" },
  { key: "supplierPayments", label: "Pagos a proveedores", tone: "out" },
  { key: "outflow", label: "Total egresos", strong: true },
  { key: "net", label: "Neto", strong: true },
];

function IncomeTab() {
  const { money, me } = useSession();
  const period = usePeriod("month");
  const [group, setGroup] = useState<"day" | "month">("day");
  const query = { ...period.query, group };
  const key = JSON.stringify(query);
  const income = useFetch(() => api.get<IncomeData>("/stats/income", query), [key]);
  const d = income.data;

  const label = (k: string) => (d?.group === "month" ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : fmtDate(k));
  const chartLabel = (k: string) => (d?.group === "month" ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}` : `${k.slice(8, 10)}/${k.slice(5, 7)}`);
  const compact = (v: number) => new Intl.NumberFormat("es-BO", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  // Los días sin movimiento se ocultan en la tabla, pero se mantienen en el gráfico
  const visibleRows = d?.rows.filter((r) => r.income || r.outflow).reverse() ?? [];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card>
        <div className="row-between wrap">
          <div className="row wrap">
            <PeriodFilter state={period} />
            <Segmented
              value={group}
              onChange={setGroup}
              options={[
                { value: "day", label: "Por día" },
                { value: "month", label: "Por mes" },
              ]}
            />
          </div>
          <a href={api.url("/stats/income.xlsx", query)} download>
            <Button icon={<Download size={14} />}>Descargar Excel</Button>
          </a>
        </div>
      </Card>

      {income.error && <Alert>{income.error}</Alert>}
      {income.loading && !d ? (
        <Loading />
      ) : d ? (
        <>
          <div className="kpi-grid">
            <Kpi label="Total ingresos" value={money(d.totals.income)} foot={`Reparaciones: ${money(d.totals.repairs)}`} />
            <Kpi label="Total egresos" value={money(d.totals.outflow)} />
            <Kpi label="Neto" value={money(d.totals.net)} tone={d.totals.net >= 0 ? "success" : "danger"} />
            <Kpi label="Abonos cobrados" value={money(d.totals.clientPayments)} foot="Ventas a crédito pagadas" />
          </div>

          <Card title={group === "month" ? "Ingresos y egresos por mes" : "Ingresos y egresos por día"}>
            {d.rows.some((r) => r.income || r.outflow) ? (
              <TimeChart
                data={d.rows.map((r) => ({ label: chartLabel(r.key), income: r.income, outflow: r.outflow }))}
                xKey="label"
                series={[
                  { key: "income", label: "Ingresos" },
                  { key: "outflow", label: "Egresos" },
                ]}
                format={compact}
              />
            ) : (
              <Empty title="Sin movimientos en el período" />
            )}
          </Card>

          <Card title="Detalle" flush>
            {visibleRows.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{group === "month" ? "Mes" : "Día"}</th>
                      {COLUMNS.map((c) => (
                        <th key={c.key} className="num">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr key={r.key}>
                        <td>{label(r.key)}</td>
                        {COLUMNS.map((c) => (
                          <td
                            key={c.key}
                            className={`num ${c.key === "net" ? (r.net >= 0 ? "text-success" : "text-danger") : ""}`}
                            style={c.strong ? { fontWeight: 600 } : undefined}
                          >
                            {r[c.key] ? money(r[c.key]) : <span className="muted">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 650 }}>Total</td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className="num" style={{ fontWeight: 650 }}>
                          {money(d.totals[c.key])}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <Empty title="Sin movimientos en el período" />
            )}
          </Card>
          <p className="note">
            Montos en {me.business.currency}. Base caja: las ventas a crédito cuentan cuando el cliente abona; los gastos y compras a
            crédito cuentan cuando se paga al proveedor.
          </p>
        </>
      ) : null}
    </div>
  );
}

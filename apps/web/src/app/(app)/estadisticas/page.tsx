"use client";

import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { DonutChart, TimeChart } from "@/components/charts";
import { Alert, Button, Card, Combobox, Empty, Field, Input, Kpi, Loading, PageHeader, Segmented, Select } from "@/components/ui";
import type { Product } from "@/components/sales/types";
import { api, type Paginated } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtDate, fmtQty, todayIso } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/labels";
import { useSession } from "@/lib/session";

type Period = "today" | "week" | "month" | "year" | "custom";

type Stats = {
  from: string;
  to: string;
  granularity: "day" | "month";
  totalSales: number;
  transactions: number;
  avgTicket: number;
  expensesTotal: number;
  repairIncome: number;
  profitEstimate: number;
  series: { date: string; sales: number; repairs: number; expenses: number }[];
  topProducts: { productId: string | null; name: string; quantity: number; total: number }[];
  byMethod: { method: PaymentMethod; total: number; count: number }[];
};

type Employee = { userId: string; name: string };
type Category = { id: string; name: string };

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mes" },
  { value: "year", label: "Este año" },
  { value: "custom", label: "Personalizado" },
];

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export default function StatsPage() {
  const { money, me } = useSession();
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState(`${todayIso().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayIso());
  const [userId, setUserId] = useState("");
  const [method, setMethod] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [product, setProduct] = useState<Product | null>(null);

  const query = {
    ...(period === "custom" ? { from, to } : { period }),
    userId,
    method,
    categoryId,
    productId: product?.id,
  };
  const key = JSON.stringify(query);

  const stats = useFetch(() => api.get<Stats>("/stats", query), [key]);
  const employees = useFetch(
    () => api.get<Employee[]>("/employees").catch(() => [] as Employee[]),
    [],
  );
  const categories = useFetch(() => api.get<Category[]>("/categories").catch(() => [] as Category[]), []);

  const d = stats.data;
  const label = (date: string) =>
    d?.granularity === "month" ? `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(2, 4)}` : date.slice(8, 10) + "/" + date.slice(5, 7);
  const series = d?.series.map((p) => ({ ...p, label: label(p.date) })) ?? [];
  const compact = (v: number) => new Intl.NumberFormat("es-BO", { notation: "compact", maximumFractionDigits: 1 }).format(v);

  return (
    <>
      <PageHeader
        title={
          <span className="row">
            Estadísticas
          </span>
        }
        subtitle={d ? `${fmtDate(d.from)} – ${fmtDate(d.to)}` : "Rendimiento del negocio"}
        actions={
          <div className="row no-print">
            <a href={api.url("/stats/export.xlsx", query)} download>
              <Button icon={<Download size={14} />}>Descargar Excel</Button>
            </a>
            <Button icon={<Printer size={14} />} onClick={() => window.print()}>
              PDF
            </Button>
          </div>
        }
      />

      <div className="stack" style={{ gap: 16 }}>
        <Card className="no-print">
          <div className="stack">
            <div className="row wrap">
              <Segmented value={period} onChange={setPeriod} options={PERIODS} />
              {period === "custom" && (
                <>
                  <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} aria-label="Desde" />
                  <Input type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} aria-label="Hasta" />
                </>
              )}
            </div>
            <div className="grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
              {(employees.data?.length ?? 0) > 0 && (
                <Field label="Empleado">
                  <Select
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="Todos"
                    options={employees.data!.map((e) => ({ value: e.userId, label: e.name }))}
                  />
                </Field>
              )}
              <Field label="Método de pago">
                <Select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  placeholder="Todos"
                  options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }))}
                />
              </Field>
              <Field label="Categoría">
                <Select
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setProduct(null);
                  }}
                  placeholder="Todas"
                  options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>
              <Field label="Producto">
                <Combobox<Product>
                  value={product?.name}
                  onClear={() => setProduct(null)}
                  placeholder="Todos"
                  fetcher={(q) => api.get<Paginated<Product>>("/products", { q, pageSize: 10 }).then((r) => r.items)}
                  renderItem={(p) => p.name}
                  onSelect={setProduct}
                />
              </Field>
            </div>
          </div>
        </Card>

        {stats.error && <Alert>{stats.error}</Alert>}
        {stats.loading && !d ? (
          <Loading />
        ) : d ? (
          <>
            <div className="kpi-grid">
              <Kpi label="Total de ventas" value={money(d.totalSales)} />
              <Kpi label="Transacciones" value={d.transactions} />
              <Kpi label="Ticket promedio" value={money(d.avgTicket)} />
              <Kpi label="Reparaciones" value={money(d.repairIncome)} foot="Pagos y adelantos cobrados" />
              <Kpi label="Gastos" value={money(d.expensesTotal)} />
              <Kpi
                label="Ingresos − egresos"
                value={money(d.totalSales + d.repairIncome - d.expensesTotal)}
                tone={d.totalSales + d.repairIncome - d.expensesTotal >= 0 ? "success" : "danger"}
                foot={`Utilidad bruta estimada: ${money(d.profitEstimate)}`}
              />
            </div>

            <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}>
              <Card title={d.granularity === "month" ? "Evolución mensual" : "Evolución diaria"}>
                {d.series.some((p) => p.sales || p.repairs || p.expenses) ? (
                  <TimeChart
                    data={series}
                    xKey="label"
                    series={[
                      { key: "sales", label: "Ventas" },
                      { key: "repairs", label: "Reparaciones" },
                      { key: "expenses", label: "Gastos" },
                    ]}
                    format={compact}
                  />
                ) : (
                  <Empty title="Sin movimientos en el período" />
                )}
              </Card>
              <Card title="Métodos de pago">
                {d.byMethod.length ? (
                  <DonutChart
                    data={d.byMethod.map((m) => ({ label: PAYMENT_METHODS[m.method], value: m.total }))}
                    format={(v) => money(v)}
                  />
                ) : (
                  <Empty title="Sin ventas" />
                )}
              </Card>
            </div>

            <Card title="Productos más vendidos" flush>
              {d.topProducts.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Producto</th>
                        <th className="num">Cantidad</th>
                        <th className="num">Total vendido</th>
                        <th className="num">% de ventas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.topProducts.map((p, i) => (
                        <tr key={`${p.productId}-${p.name}`}>
                          <td className="muted">{i + 1}</td>
                          <td>{p.name}</td>
                          <td className="num">{fmtQty(p.quantity)}</td>
                          <td className="num">{money(p.total)}</td>
                          <td className="num">{d.totalSales ? `${((p.total / d.totalSales) * 100).toFixed(1)} %` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Sin ventas en el período" />
              )}
            </Card>
            <p className="note">
              Montos en {me.business.currency}. Solo ventas completadas; la utilidad bruta descuenta el costo registrado de cada producto.
            </p>
          </>
        ) : null}
      </div>
    </>
  );
}

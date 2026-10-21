"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, Minus, ShoppingCart } from "lucide-react";
import { Badge, Button, Card, Empty, Input, Kpi, Loading, Modal, PageHeader, Pager, Tabs, useConfirm, useToast } from "@/components/ui";
import { ExpenseForm } from "@/components/sales/ExpenseForm";
import { Receipt } from "@/components/sales/Receipt";
import type { ExpenseRow, SaleDetail, SaleRow } from "@/components/sales/types";
import { api, ApiError, type Paginated } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtDateTime, fmtQty, fmtSeq, todayIso } from "@/lib/format";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type ExpenseCategory } from "@/lib/labels";
import { useSession } from "@/lib/session";

type BalanceData = {
  date: string;
  salesTotal: number;
  salesCount: number;
  expensesTotal: number;
  repairsTotal: number;
  repairsCount: number;
  balance: number;
  byMethod: { method: keyof typeof PAYMENT_METHODS; total: number }[];
  creditSales: number;
};

const PAGE_SIZE = 25;

export default function BalancePage() {
  const { me, money, can, isOwner } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const tz = me.business.timezone;

  const [date, setDate] = useState(todayIso());
  const [tab, setTab] = useState<"sales" | "expenses">(can("sales_view") || !can("expenses_view") ? "sales" : "expenses");
  const [salesPage, setSalesPage] = useState(1);
  const [expPage, setExpPage] = useState(1);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [receipt, setReceipt] = useState<SaleDetail | null>(null);
  const [voiding, setVoiding] = useState(false);

  const balance = useFetch(() => api.get<BalanceData>("/balance", { date }), [date]);
  const sales = useFetch(
    () =>
      can("sales_view")
        ? api.get<Paginated<SaleRow>>("/sales", { from: date, to: date, page: salesPage, pageSize: PAGE_SIZE })
        : Promise.resolve(null),
    [date, salesPage],
  );
  const expenses = useFetch(
    () =>
      can("expenses_view")
        ? api.get<Paginated<ExpenseRow>>("/expenses", { from: date, to: date, page: expPage, pageSize: PAGE_SIZE })
        : Promise.resolve(null),
    [date, expPage],
  );

  const reloadAll = () => {
    void balance.reload();
    void sales.reload();
    void expenses.reload();
  };

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
      reloadAll();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo anular", true);
    } finally {
      setVoiding(false);
    }
  };

  const deleteExpense = async (id: string) => {
    if (!confirm("¿Eliminar este gasto?")) return;
    try {
      await api.del(`/expenses/${id}`);
      toast("Gasto eliminado");
      reloadAll();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo eliminar", true);
    }
  };

  const b = balance.data;
  const tabs = [
    ...(can("sales_view") ? [{ value: "sales" as const, label: `Ventas${b ? ` (${b.salesCount})` : ""}` }] : []),
    ...(can("expenses_view") ? [{ value: "expenses" as const, label: "Gastos" }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Balance"
        subtitle="Ventas, reparaciones y gastos del día"
        actions={
          <>
            <Input
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => {
                setDate(e.target.value || todayIso());
                setSalesPage(1);
                setExpPage(1);
              }}
              style={{ width: 150 }}
              aria-label="Fecha"
            />
            {can("expenses_create") && (
              <Button icon={<Minus size={14} />} onClick={() => setExpenseOpen(true)}>
                Gasto
              </Button>
            )}
            {can("sales_create") && (
              <Link href="/vender">
                <Button variant="primary" icon={<ShoppingCart size={14} />}>
                  Vender
                </Button>
              </Link>
            )}
          </>
        }
      />

      <div className="stack" style={{ gap: 16 }}>
        <div className="kpi-grid">
          <Kpi label="Ventas" value={b ? money(b.salesTotal) : "—"} foot={b && b.creditSales > 0 ? `${money(b.creditSales)} a crédito` : undefined} />
          <Kpi label="Reparaciones" value={b ? money(b.repairsTotal) : "—"} foot={b && b.repairsCount ? `${b.repairsCount} pagos` : undefined} />
          <Kpi label="Gastos" value={b ? money(b.expensesTotal) : "—"} />
          <Kpi
            label="Balance"
            value={b ? money(b.balance) : "—"}
            tone={b ? (b.balance >= 0 ? "success" : "danger") : undefined}
          />
          <Kpi label="Transacciones" value={b ? b.salesCount : "—"} foot="Ventas completadas" />
        </div>

        {b && b.byMethod.length > 0 && (
          <div className="row wrap">
            {b.byMethod.map((m) => (
              <Badge key={m.method}>
                {PAYMENT_METHODS[m.method]}: {money(m.total)}
              </Badge>
            ))}
          </div>
        )}

        {tabs.length > 0 && (
          <Card flush>
            <div style={{ padding: "0 8px" }}>
              <div className="row-between">
                <Tabs value={tab} onChange={setTab} tabs={tabs} />
                {tab === "expenses" && (expenses.data?.items.length ?? 0) > 0 && (
                  <a href={api.url("/expenses/export.xlsx", { from: date, to: date })} download>
                    <Button size="sm" icon={<Download size={13} />}>
                      Excel
                    </Button>
                  </a>
                )}
              </div>
            </div>

            {tab === "sales" &&
              (sales.loading && !sales.data ? (
                <Loading />
              ) : !sales.data?.items.length ? (
                <Empty title="Sin ventas este día">Las ventas que registres aparecerán aquí.</Empty>
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Número</th>
                          <th>Hora</th>
                          <th>Cliente</th>
                          <th>Método</th>
                          <th className="num">Ítems</th>
                          <th className="num">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.data.items.map((s) => (
                          <tr key={s.id} className="clickable" onClick={() => openSale(s.id)}>
                            <td>
                              <span className="mono">#{fmtSeq(s.number)}</span>{" "}
                              {s.status === "VOIDED" && <Badge tone="danger">Anulada</Badge>}
                            </td>
                            <td>{fmtDateTime(s.createdAt, tz)}</td>
                            <td>{s.client?.name ?? <span className="muted">—</span>}</td>
                            <td>{PAYMENT_METHODS[s.method]}</td>
                            <td className="num">{s._count.items}</td>
                            <td className="num" style={s.status === "VOIDED" ? { textDecoration: "line-through" } : undefined}>
                              {money(s.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pager page={salesPage} pageSize={PAGE_SIZE} total={sales.data.total} onPage={setSalesPage} />
                </>
              ))}

            {tab === "expenses" &&
              (expenses.loading && !expenses.data ? (
                <Loading />
              ) : !expenses.data?.items.length ? (
                <Empty title="Sin gastos este día" />
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Hora</th>
                          <th>Categoría</th>
                          <th>Concepto</th>
                          <th>Proveedor</th>
                          <th>Método</th>
                          <th className="num">Monto</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.data.items.map((e) => (
                          <tr key={e.id}>
                            <td>{fmtDateTime(e.date, tz)}</td>
                            <td>{EXPENSE_CATEGORIES[e.category as ExpenseCategory] ?? e.category}</td>
                            <td>
                              {e.description ?? <span className="muted">—</span>}
                              {e.product && (
                                <div className="note">
                                  +{fmtQty(e.quantity, e.product.unit)} {e.product.name}
                                </div>
                              )}
                            </td>
                            <td>{e.supplier?.name ?? <span className="muted">—</span>}</td>
                            <td>{e.method ? (e.method === "CREDIT" ? "A crédito" : PAYMENT_METHODS[e.method]) : "—"}</td>
                            <td className="num">{money(e.amount)}</td>
                            <td className="num">
                              <div className="row" style={{ justifyContent: "flex-end" }}>
                                {e.receiptUrl && (
                                  <a href={e.receiptUrl} target="_blank" rel="noreferrer">
                                    Ver
                                  </a>
                                )}
                                {isOwner && (
                                  <Button size="sm" variant="ghost" onClick={() => deleteExpense(e.id)}>
                                    Eliminar
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pager page={expPage} pageSize={PAGE_SIZE} total={expenses.data.total} onPage={setExpPage} />
                </>
              ))}
          </Card>
        )}
      </div>

      <ExpenseForm open={expenseOpen} onClose={() => setExpenseOpen(false)} onSaved={reloadAll} />

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
    </>
  );
}

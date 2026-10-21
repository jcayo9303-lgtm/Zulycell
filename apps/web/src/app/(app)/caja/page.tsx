"use client";

import { useState, type FormEvent } from "react";
import { Download, Lock, Minus, Plus, Printer, Unlock } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Kpi,
  Loading,
  Modal,
  PageHeader,
  Pager,
  Tabs,
  Textarea,
  useToast,
} from "@/components/ui";
import { CashReport, MethodBreakdown } from "@/components/sales/CashReport";
import { PeriodFilter, usePeriod } from "@/components/sales/PeriodFilter";
import type { CashSession, CashSessionRow } from "@/components/sales/types";
import { api, ApiError, type Paginated } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtDateTime, round2 } from "@/lib/format";
import { useSession } from "@/lib/session";

const PAGE_SIZE = 20;

export default function CashPage() {
  const [tab, setTab] = useState<"current" | "history">("current");
  return (
    <>
      <PageHeader title="Caja" subtitle="Apertura, ingresos y retiros de efectivo y cierre de caja" />
      <div style={{ marginBottom: 16 }}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "current", label: "Caja actual" },
            { value: "history", label: "Historial de cierres" },
          ]}
        />
      </div>
      {tab === "current" ? <CurrentCash /> : <CashHistory />}
    </>
  );
}

function CurrentCash() {
  const { me, money, can } = useSession();
  const toast = useToast();
  const tz = me.business.timezone;
  const manage = can("cash_manage");

  const current = useFetch(() => api.get<{ session: CashSession | null }>("/cash/current"), []);
  const [opening, setOpening] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [movement, setMovement] = useState<"IN" | "OUT" | null>(null);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState<CashSession | null>(null);

  const session = current.data?.session ?? null;

  const open = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/cash/open", { openingAmount: opening || 0, notes: openNotes });
      toast("Caja abierta");
      setOpening("");
      setOpenNotes("");
      await current.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo abrir la caja", true);
    } finally {
      setBusy(false);
    }
  };

  if (current.loading && !current.data) return <Loading />;
  if (current.error) return <Alert>{current.error}</Alert>;

  if (!session) {
    return (
      <>
        {!manage ? (
          <Card>
            <Empty title="No hay una caja abierta">Pide a un responsable que abra la caja.</Empty>
          </Card>
        ) : (
          <Card title="Abrir caja">
            <form className="stack" onSubmit={open} style={{ maxWidth: 420 }}>
              <Field label="Efectivo inicial en caja" required hint="El dinero con el que empiezas el turno (sencillo / cambio)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  autoFocus
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Notas">
                <Textarea maxLength={500} value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} />
              </Field>
              <div>
                <Button type="submit" variant="primary" icon={<Unlock size={14} />} loading={busy}>
                  Abrir caja
                </Button>
              </div>
            </form>
          </Card>
        )}
        <Modal open={Boolean(closed)} onClose={() => setClosed(null)} title="Reporte de cierre" width={560}
          footer={
            <>
              {closed && (
                <a href={api.url(`/cash/sessions/${closed.id}/export.xlsx`)} download>
                  <Button icon={<Download size={14} />}>Excel</Button>
                </a>
              )}
              <Button variant="primary" icon={<Printer size={14} />} onClick={() => window.print()}>
                Imprimir
              </Button>
            </>
          }
        >
          {closed && <CashReport session={closed} />}
        </Modal>
      </>
    );
  }

  const s = session.summary;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between wrap">
        <div className="row wrap">
          <Badge tone="success">Caja abierta</Badge>
          <span className="note">
            Desde {fmtDateTime(session.openedAt, tz)} · {session.openedByName ?? "—"}
          </span>
        </div>
        <div className="row wrap">
          <Button size="sm" variant="ghost" onClick={() => current.reload()}>
            Actualizar
          </Button>
          {manage && (
            <>
              <Button icon={<Plus size={14} />} onClick={() => setMovement("IN")}>
                Ingreso de efectivo
              </Button>
              <Button icon={<Minus size={14} />} onClick={() => setMovement("OUT")}>
                Retiro de efectivo
              </Button>
              <Button variant="primary" icon={<Lock size={14} />} onClick={() => setClosing(true)}>
                Cerrar caja
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label="Apertura" value={money(s.openingAmount)} />
        <Kpi label="Efectivo esperado" value={money(s.expectedCash)} foot={`Entradas ${money(s.cashIn)} · Salidas ${money(s.cashOut)}`} />
        <Kpi label="Ventas del turno" value={money(s.sales.total)} foot={`${s.sales.count} ventas`} />
        <Kpi label="Reparaciones" value={money(s.repairs.total)} />
      </div>

      <div className="grid-2">
        <Card title="Desglose por método de pago" flush>
          <MethodBreakdown summary={s} />
        </Card>
        <Card title="Ingresos y retiros de efectivo" flush>
          {session.movements.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Motivo</th>
                    <th>Usuario</th>
                    <th className="num">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {session.movements.map((m) => (
                    <tr key={m.id}>
                      <td>{fmtDateTime(m.createdAt, tz)}</td>
                      <td>{m.reason}</td>
                      <td>{m.userName ?? "—"}</td>
                      <td className={`num ${m.type === "IN" ? "text-success" : "text-danger"}`}>
                        {m.type === "IN" ? "+" : "−"}
                        {money(m.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Sin ingresos ni retiros">Registra aquí el cambio que agregas o el dinero que retiras de la caja.</Empty>
          )}
        </Card>
      </div>

      <MovementModal
        type={movement}
        onClose={() => setMovement(null)}
        onSaved={() => {
          setMovement(null);
          void current.reload();
        }}
      />
      <CloseModal
        open={closing}
        expected={s.expectedCash}
        onClose={() => setClosing(false)}
        onClosed={(done) => {
          setClosing(false);
          setClosed(done);
          void current.reload();
        }}
      />
    </div>
  );
}

function MovementModal({ type, onClose, onSaved }: { type: "IN" | "OUT" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      await api.post("/cash/movements", { type, amount, reason });
      toast(type === "IN" ? "Ingreso registrado" : "Retiro registrado");
      setAmount("");
      setReason("");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields ?? {});
        if (!err.fields) toast(err.message, true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(type)} onClose={onClose} title={type === "IN" ? "Ingreso de efectivo" : "Retiro de efectivo"} width={420}>
      <form className="stack" onSubmit={save}>
        <Field label="Monto" required error={fields.amount}>
          <Input type="number" min={0.01} step="0.01" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Motivo" required error={fields.reason}>
          <Input
            maxLength={255}
            placeholder={type === "IN" ? "Cambio agregado, fondo…" : "Depósito al banco, pago menor…"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!amount || !reason.trim()}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CloseModal({
  open,
  expected,
  onClose,
  onClosed,
}: {
  open: boolean;
  expected: number;
  onClose: () => void;
  onClosed: (s: CashSession) => void;
}) {
  const { money } = useSession();
  const toast = useToast();
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const diff = counted === "" ? null : round2(Number(counted) - expected);

  const close = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const done = await api.post<CashSession>("/cash/close", { countedCash: counted, notes });
      toast("Caja cerrada");
      setCounted("");
      setNotes("");
      onClosed(done);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo cerrar la caja", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Cerrar caja" width={440}>
      <form className="stack" onSubmit={close}>
        <div className="row-between">
          <span className="muted">Efectivo esperado</span>
          <strong className="num">{money(expected)}</strong>
        </div>
        <Field label="Efectivo contado" required hint="Cuenta los billetes y monedas que hay en la caja">
          <Input type="number" min={0} step="0.01" inputMode="decimal" autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} />
        </Field>
        {diff !== null && (
          <div className="row-between">
            <span className="muted">{diff > 0 ? "Sobrante" : diff < 0 ? "Faltante" : "Diferencia"}</span>
            <strong className={`num ${diff > 0 ? "text-success" : diff < 0 ? "text-danger" : ""}`}>
              {diff === 0 ? "La caja cuadra" : money(diff)}
            </strong>
          </div>
        )}
        <Field label="Notas">
          <Textarea maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Explica la diferencia si la hay" />
        </Field>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" icon={<Lock size={14} />} loading={busy} disabled={counted === ""}>
            Cerrar caja
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CashHistory() {
  const { me, money } = useSession();
  const toast = useToast();
  const tz = me.business.timezone;
  const period = usePeriod("month");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<CashSession | null>(null);
  const key = JSON.stringify(period.query);
  const list = useFetch(() => api.get<Paginated<CashSessionRow>>("/cash/sessions", { ...period.query, page, pageSize: PAGE_SIZE }), [key, page]);

  const openDetail = async (id: string) => {
    try {
      setDetail(await api.get<CashSession>(`/cash/sessions/${id}`));
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo abrir el cierre", true);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card>
        <PeriodFilter state={period} onChange={() => setPage(1)} />
      </Card>
      {list.error && <Alert>{list.error}</Alert>}
      <Card flush>
        {list.loading && !list.data ? (
          <Loading />
        ) : !list.data?.items.length ? (
          <Empty title="No hay cierres en el período" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Apertura</th>
                    <th>Cierre</th>
                    <th>Responsable</th>
                    <th className="num">Ventas</th>
                    <th className="num">Reparaciones</th>
                    <th className="num">Esperado</th>
                    <th className="num">Contado</th>
                    <th className="num">Diferencia</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => openDetail(r.id)}>
                      <td>{fmtDateTime(r.openedAt, tz)}</td>
                      <td>{r.closedAt ? fmtDateTime(r.closedAt, tz) : <Badge tone="success">Abierta</Badge>}</td>
                      <td>{r.closedByName ?? r.openedByName ?? "—"}</td>
                      <td className="num">{r.salesTotal === null ? "—" : money(r.salesTotal)}</td>
                      <td className="num">{r.repairsTotal === null ? "—" : money(r.repairsTotal)}</td>
                      <td className="num">{r.expectedCash === null ? "—" : money(r.expectedCash)}</td>
                      <td className="num">{r.countedCash === null ? "—" : money(r.countedCash)}</td>
                      <td className={`num ${r.difference ? (r.difference > 0 ? "text-success" : "text-danger") : ""}`}>
                        {r.difference === null ? "—" : money(r.difference)}
                      </td>
                      <td className="num" onClick={(e) => e.stopPropagation()}>
                        <a href={api.url(`/cash/sessions/${r.id}/export.xlsx`)} download aria-label="Descargar Excel">
                          <Button size="sm" variant="ghost" icon={<Download size={13} />}>
                            Excel
                          </Button>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Reporte de caja"
        width={560}
        footer={
          <>
            {detail && (
              <a href={api.url(`/cash/sessions/${detail.id}/export.xlsx`)} download>
                <Button icon={<Download size={14} />}>Excel</Button>
              </a>
            )}
            <Button variant="primary" icon={<Printer size={14} />} onClick={() => window.print()}>
              Imprimir
            </Button>
          </>
        }
      >
        {detail && <CashReport session={detail} />}
      </Modal>
    </div>
  );
}

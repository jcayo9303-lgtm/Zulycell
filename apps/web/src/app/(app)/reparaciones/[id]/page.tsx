"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessageCircle, Pencil, Printer, Trash2 } from "lucide-react";
import s from "@/components/repairs/repairs.module.css";
import {
  Alert,
  Button,
  Card,
  Combobox,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select,
  Textarea,
  Toggle,
  useToast,
} from "@/components/ui";
import { StatusBadge } from "@/components/repairs/StatusBadge";
import { DeviceFields, type Technician } from "@/components/repairs/DeviceFields";
import { RepairPrint, warrantyUntil } from "@/components/repairs/RepairPrint";
import { isOverdue, joinAccessories, splitAccessories, toLocalInput, type DeviceForm, type RepairDetail } from "@/components/repairs/types";
import { api, ApiError } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { fmtDate, fmtDateTime, fmtNumber, fmtQty, fmtSeq } from "@/lib/format";
import { PAYMENT_METHODS, REPAIR_STATUS, options, type RepairStatus } from "@/lib/labels";

const PAY_METHODS = options(PAYMENT_METHODS).filter((o) => o.value !== "CREDIT");

const ACTION_LABEL: Record<RepairStatus, string> = {
  RECEIVED: "Volver a recibido",
  DIAGNOSING: "Pasar a diagnóstico",
  WAITING_PARTS: "Esperando repuesto",
  REPAIRING: "En reparación",
  READY: "Marcar como listo",
  DELIVERED: "Entregar al cliente",
  UNREPAIRABLE: "Sin reparación",
  CANCELLED: "Cancelar orden",
};

type ProductOption = {
  id: string;
  name: string;
  price: number;
  stock: number;
  unit: string;
  trackStock: boolean;
  variants: { id: string; value: string; price: number | null; stock: number }[];
};

function toDeviceForm(r: RepairDetail): DeviceForm {
  return {
    deviceType: r.deviceType,
    brand: r.brand,
    model: r.model,
    imei: r.imei ?? "",
    color: r.color ?? "",
    accessCode: r.accessCode ?? "",
    ...splitAccessories(r.accessories),
    reportedIssue: r.reportedIssue,
    physicalCondition: r.physicalCondition ?? "",
    estimatedCost: String(r.estimatedCost),
    promisedAt: toLocalInput(r.promisedAt),
    warrantyDays: String(r.warrantyDays),
    technicianId: r.technicianId ?? "",
    notes: r.notes ?? "",
  };
}

/** Cuerpo completo para PUT /repairs/:id */
function updatePayload(r: RepairDetail, device: DeviceForm, extra: { diagnosis?: string; laborCost?: string | number } = {}) {
  return {
    deviceType: device.deviceType,
    brand: device.brand,
    model: device.model,
    imei: device.imei,
    color: device.color,
    accessCode: device.accessCode,
    accessories: joinAccessories(device),
    reportedIssue: device.reportedIssue,
    physicalCondition: device.physicalCondition,
    estimatedCost: device.estimatedCost || 0,
    promisedAt: device.promisedAt ? new Date(device.promisedAt).toISOString() : null,
    warrantyDays: device.warrantyDays || 0,
    technicianId: device.technicianId || null,
    notes: device.notes,
    diagnosis: extra.diagnosis ?? r.diagnosis ?? "",
    laborCost: extra.laborCost ?? r.laborCost,
  };
}

export default function RepairDetailPage({ params }: { params: { id: string } }) {
  const toast = useToast();
  const { me, money, can, isOwner } = useSession();
  const repair = useFetch(() => api.get<RepairDetail>(`/repairs/${params.id}`), [params.id]);
  const [technicians, setTechnicians] = useState<Technician[] | null>(null);
  const [printMode, setPrintMode] = useState<"order" | "delivery" | null>(null);
  const [justCreated, setJustCreated] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [device, setDevice] = useState<DeviceForm | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [labor, setLabor] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payNotes, setPayNotes] = useState("");

  const [part, setPart] = useState<ProductOption | null>(null);
  const [freePart, setFreePart] = useState(false);
  const [partName, setPartName] = useState("");
  const [partVariant, setPartVariant] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [partPrice, setPartPrice] = useState("");

  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const r = repair.data;
  const editable = can("repairs_edit") && r && !["DELIVERED", "CANCELLED"].includes(r.status);

  useEffect(() => {
    setJustCreated(new URLSearchParams(window.location.search).get("imprimir") === "1");
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    api
      .get<(Technician & { active: boolean })[]>("/employees")
      .then((list) => setTechnicians(list.filter((e) => e.active)))
      .catch(() => setTechnicians(null));
  }, [isOwner]);

  useEffect(() => {
    if (!r) return;
    setDiagnosis(r.diagnosis ?? "");
    setLabor(String(r.laborCost));
  }, [r]);

  useEffect(() => {
    if (!printMode) return;
    const t = setTimeout(() => {
      window.print();
      setPrintMode(null);
    }, 50);
    return () => clearTimeout(t);
  }, [printMode]);

  if (repair.error) return <Alert>{repair.error}</Alert>;
  if (!r) return <Loading />;

  const tz = me.business.timezone;

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setFields({});
    try {
      await fn();
      await repair.reload();
      if (ok) toast(ok);
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields ?? {});
        toast(err.message, true);
      } else toast("No se pudo completar la acción.", true);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const changeStatus = async (status: RepairStatus) => {
    if (status === "DELIVERED") {
      setPayAmount(r.balance > 0 ? String(r.balance) : "");
      setPayMethod("CASH");
      setDeliverOpen(true);
      return;
    }
    if ((status === "CANCELLED" || status === "UNREPAIRABLE") && r.parts.some((p) => p.productId)) {
      if (!window.confirm("Los repuestos de inventario se devolverán al stock. ¿Continuar?")) return;
    } else if (status === "CANCELLED" && !window.confirm("¿Cancelar la orden?")) return;
    const ok = await run(`status-${status}`, () => api.post(`/repairs/${r.id}/status`, { status }), `Estado: ${REPAIR_STATUS[status]}`);
    if (ok && (status === "READY" || status === "UNREPAIRABLE") && r.client.phone && window.confirm("¿Avisar al cliente por WhatsApp?")) {
      void notify();
    }
  };

  const notify = async () => {
    try {
      const { url } = await api.get<{ url: string }>(`/repairs/${r.id}/notify`);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo generar el mensaje", true);
    }
  };

  const saveDiagnosis = () =>
    run("diagnosis", () => api.put(`/repairs/${r.id}`, updatePayload(r, toDeviceForm(r), { diagnosis, laborCost: labor || 0 })), "Diagnóstico guardado");

  const saveDevice = async () => {
    if (!device) return;
    const ok = await run("device", () => api.put(`/repairs/${r.id}`, updatePayload(r, device)), "Orden actualizada");
    if (ok) setEditOpen(false);
  };

  const addPart = async () => {
    const body = freePart
      ? { name: partName, quantity: partQty, unitPrice: partPrice || 0 }
      : { productId: part?.id, variantId: partVariant || null, quantity: partQty, unitPrice: partPrice === "" ? null : partPrice };
    const ok = await run("part", () => api.post(`/repairs/${r.id}/parts`, body), "Repuesto agregado");
    if (ok) {
      setPart(null);
      setPartName("");
      setPartVariant("");
      setPartQty("1");
      setPartPrice("");
    }
  };

  const removePart = (partId: string) => {
    if (!window.confirm("¿Quitar el repuesto? Si es de inventario vuelve al stock.")) return;
    void run(`rm-${partId}`, () => api.del(`/repairs/${r.id}/parts/${partId}`), "Repuesto quitado");
  };

  const pay = async () => {
    const ok = await run("pay", () => api.post(`/repairs/${r.id}/payments`, { amount: payAmount, method: payMethod, notes: payNotes }), "Pago registrado");
    if (ok) setPayOpen(false);
  };

  const deliver = async () => {
    const ok = await run(
      "deliver",
      () =>
        api.post(`/repairs/${r.id}/status`, {
          status: "DELIVERED",
          payment: r.balance > 0 ? { amount: payAmount, method: payMethod } : null,
        }),
      "Equipo entregado",
    );
    if (ok) {
      setDeliverOpen(false);
      if (window.confirm("¿Imprimir el comprobante de entrega con la garantía?")) setPrintMode("delivery");
    }
  };

  const chosenVariant = part?.variants.find((v) => v.id === partVariant);
  const suggestedPrice = chosenVariant?.price ?? part?.price;
  const until = warrantyUntil(r);
  const overdue = isOverdue(r);

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={
            <span className="row">
              Orden <span className="mono">{fmtSeq(r.number)}</span> <StatusBadge status={r.status} />
            </span>
          }
          subtitle={`${r.brand} ${r.model} · ${r.client.name} · recibido ${fmtDateTime(r.createdAt, tz)}${r.receivedByName ? ` por ${r.receivedByName}` : ""}`}
          actions={
            <>
              <Link href="/reparaciones">
                <Button icon={<ArrowLeft size={14} />}>Volver</Button>
              </Link>
              <Button icon={<Printer size={14} />} onClick={() => setPrintMode("order")}>
                Imprimir orden
              </Button>
              {r.status === "DELIVERED" && (
                <Button icon={<Printer size={14} />} onClick={() => setPrintMode("delivery")}>
                  Comprobante de entrega
                </Button>
              )}
              {r.client.phone && (
                <Button icon={<MessageCircle size={14} />} onClick={notify}>
                  WhatsApp
                </Button>
              )}
            </>
          }
        />

        <div className="stack">
          {justCreated && (
            <Alert tone="info">
              Orden creada.{" "}
              <a href="#" onClick={(e) => (e.preventDefault(), setPrintMode("order"))}>
                Imprime la orden
              </a>{" "}
              para que el cliente la firme y quédate con el talón.
            </Alert>
          )}

          {can("repairs_edit") && r.allowedStatuses.length > 0 && (
            <Card title="Cambiar estado">
              <div className="row wrap">
                {r.allowedStatuses.map((st) => (
                  <Button
                    key={st}
                    variant={st === "READY" || st === "DELIVERED" ? "primary" : st === "CANCELLED" || st === "UNREPAIRABLE" ? "danger" : "secondary"}
                    loading={busy === `status-${st}`}
                    onClick={() => changeStatus(st)}
                  >
                    {ACTION_LABEL[st]}
                  </Button>
                ))}
              </div>
            </Card>
          )}

          <div className={s.layout}>
            <div className="stack">
              <Card
                title="Equipo"
                actions={
                  editable && (
                    <Button size="sm" icon={<Pencil size={13} />} onClick={() => (setDevice(toDeviceForm(r)), setFields({}), setEditOpen(true))}>
                      Editar
                    </Button>
                  )
                }
              >
                <dl className={s.dl}>
                  <dt>Equipo</dt>
                  <dd>
                    {r.deviceType} · {r.brand} {r.model}
                    {r.color ? ` · ${r.color}` : ""}
                  </dd>
                  <dt>IMEI / serie</dt>
                  <dd className="mono">{r.imei || "—"}</dd>
                  <dt>Clave / patrón</dt>
                  <dd>
                    {r.accessCode ? (
                      <span className="row">
                        <span className={s.secret}>{showCode ? r.accessCode : "••••••"}</span>
                        <Button size="sm" variant="ghost" onClick={() => setShowCode(!showCode)}>
                          {showCode ? "Ocultar" : "Ver"}
                        </Button>
                      </span>
                    ) : (
                      "—"
                    )}
                  </dd>
                  <dt>Accesorios</dt>
                  <dd>{r.accessories || "Ninguno"}</dd>
                  <dt>Falla reportada</dt>
                  <dd>{r.reportedIssue}</dd>
                  <dt>Estado físico</dt>
                  <dd>{r.physicalCondition || "—"}</dd>
                  <dt>Técnico</dt>
                  <dd>{r.technicianName ?? "Sin asignar"}</dd>
                  <dt>Entrega prometida</dt>
                  <dd className={overdue ? "text-danger" : undefined}>
                    {r.promisedAt ? fmtDateTime(r.promisedAt, tz) : "Por confirmar"}
                    {overdue && " · vencida"}
                  </dd>
                  <dt>Garantía</dt>
                  <dd>
                    {r.warrantyDays} días{until ? ` · hasta ${fmtDate(until, tz)}` : ""}
                  </dd>
                  {r.notes && (
                    <>
                      <dt>Notas</dt>
                      <dd>{r.notes}</dd>
                    </>
                  )}
                </dl>
              </Card>

              <Card title="Diagnóstico y mano de obra">
                <div className="stack">
                  <Field label="Diagnóstico / trabajo realizado" error={fields.diagnosis}>
                    <Textarea
                      rows={4}
                      maxLength={1000}
                      disabled={!editable}
                      placeholder="Ej.: Pin de carga sulfatado. Se reemplaza conector y se limpia placa."
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                    />
                  </Field>
                  <div className="row wrap" style={{ alignItems: "flex-end" }}>
                    <Field label="Mano de obra" error={fields.laborCost}>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="num"
                        style={{ maxWidth: 180 }}
                        disabled={!editable}
                        value={labor}
                        onChange={(e) => setLabor(e.target.value)}
                      />
                    </Field>
                    <span className="note">Costo estimado al recibir: {money(r.estimatedCost)}</span>
                    {editable && (
                      <Button variant="primary" loading={busy === "diagnosis"} onClick={saveDiagnosis} style={{ marginLeft: "auto" }}>
                        Guardar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

              <Card title="Repuestos" flush>
                {r.parts.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Repuesto</th>
                          <th className="num">Cant.</th>
                          <th className="num">P. unit.</th>
                          <th className="num">Subtotal</th>
                          {editable && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {r.parts.map((p) => (
                          <tr key={p.id}>
                            <td>
                              {p.name}
                              {!p.productId && <div className="note">Sin inventario</div>}
                            </td>
                            <td className="num">{fmtNumber(p.quantity, Number.isInteger(p.quantity) ? 0 : 3)}</td>
                            <td className="num">{money(p.unitPrice)}</td>
                            <td className="num">{money(p.subtotal)}</td>
                            {editable && (
                              <td className="num">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label="Quitar"
                                  loading={busy === `rm-${p.id}`}
                                  icon={<Trash2 size={13} />}
                                  onClick={() => removePart(p.id)}
                                />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="note" style={{ padding: 16 }}>
                    Sin repuestos. Los repuestos del inventario se descuentan del stock al agregarlos.
                  </div>
                )}

                {editable && r.status !== "UNREPAIRABLE" && (
                  <>
                    <div className={s.addPart}>
                      {freePart ? (
                        <Field label="Repuesto (sin inventario)" error={fields.name}>
                          <Input maxLength={160} value={partName} onChange={(e) => setPartName(e.target.value)} />
                        </Field>
                      ) : (
                        <Field label="Repuesto del inventario" error={fields.productId}>
                          <Combobox<ProductOption>
                            placeholder="Pantalla, batería, pin de carga…"
                            value={part ? part.name : null}
                            onClear={() => (setPart(null), setPartVariant(""))}
                            onSelect={(p) => {
                              setPart(p);
                              setPartVariant("");
                              setPartPrice("");
                            }}
                            fetcher={(q) => api.get<{ items: ProductOption[] }>("/products", { q, pageSize: 10, includeRecipes: false }).then((x) => x.items)}
                            renderItem={(p) => (
                              <div className="row-between">
                                <span>{p.name}</span>
                                <span className="note">
                                  {money(p.price)} · {p.trackStock ? fmtQty(p.stock, p.unit) : "servicio"}
                                </span>
                              </div>
                            )}
                          />
                        </Field>
                      )}
                      {!freePart && part?.variants.length ? (
                        <Field label="Variante" error={fields.variantId}>
                          <Select
                            value={partVariant}
                            onChange={(e) => setPartVariant(e.target.value)}
                            placeholder="Elegir…"
                            options={part.variants.map((v) => ({ value: v.id, label: `${v.value} (${fmtNumber(v.stock)})` }))}
                          />
                        </Field>
                      ) : (
                        <div />
                      )}
                      <Field label="Cantidad" error={fields.quantity}>
                        <Input type="number" min={0} step="any" className="num" value={partQty} onChange={(e) => setPartQty(e.target.value)} />
                      </Field>
                      <Field label="Precio unit." error={fields.unitPrice}>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="num"
                          placeholder={suggestedPrice !== undefined ? String(suggestedPrice) : ""}
                          value={partPrice}
                          onChange={(e) => setPartPrice(e.target.value)}
                        />
                      </Field>
                      <Button
                        variant="primary"
                        loading={busy === "part"}
                        disabled={freePart ? !partName.trim() : !part || (part.variants.length > 0 && !partVariant)}
                        onClick={addPart}
                      >
                        Agregar
                      </Button>
                    </div>
                    <div style={{ padding: "0 16px 12px" }}>
                      <Toggle checked={freePart} onChange={(v) => (setFreePart(v), setPart(null))} label="Repuesto que no está en el inventario" />
                    </div>
                  </>
                )}
              </Card>
            </div>

            <div className="stack">
              <Card title="Cliente">
                <dl className={s.dl}>
                  <dt>Nombre</dt>
                  <dd>
                    <Link href={`/clientes/${r.client.id}`}>{r.client.name}</Link>
                  </dd>
                  <dt>Celular</dt>
                  <dd>{r.client.phone || "—"}</dd>
                  {r.client.document && (
                    <>
                      <dt>Documento</dt>
                      <dd className="mono">{r.client.document}</dd>
                    </>
                  )}
                </dl>
                {r.client.phone && (
                  <div style={{ marginTop: 12 }}>
                    <Button size="sm" icon={<MessageCircle size={13} />} onClick={notify}>
                      Avisar por WhatsApp
                    </Button>
                  </div>
                )}
              </Card>

              <Card title="Totales">
                <div className={s.totals}>
                  <div>
                    <span>Mano de obra</span>
                    <span className="num">{money(r.laborCost)}</span>
                  </div>
                  <div>
                    <span>Repuestos</span>
                    <span className="num">{money(r.partsTotal)}</span>
                  </div>
                  <div className={s.grand}>
                    <span>Total</span>
                    <span className="num">{money(r.total)}</span>
                  </div>
                  <div>
                    <span>Pagado</span>
                    <span className="num">{money(r.paid)}</span>
                  </div>
                  <div>
                    <span>Saldo</span>
                    <span className={`num ${s.bigBalance} ${r.balance > 0 ? "text-danger" : "text-success"}`}>{money(r.balance)}</span>
                  </div>
                </div>
              </Card>

              <Card
                title="Pagos"
                actions={
                  can("repairs_edit") &&
                  r.status !== "CANCELLED" &&
                  r.balance > 0 && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setPayAmount(String(r.balance));
                        setPayMethod("CASH");
                        setPayNotes("");
                        setFields({});
                        setPayOpen(true);
                      }}
                    >
                      Registrar pago
                    </Button>
                  )
                }
                flush
              >
                {r.payments.length ? (
                  <table className="table">
                    <tbody>
                      {r.payments.map((p) => (
                        <tr key={p.id}>
                          <td>
                            {fmtDateTime(p.createdAt, tz)}
                            <div className="note">
                              {PAYMENT_METHODS[p.method]}
                              {p.notes ? ` · ${p.notes}` : ""}
                            </div>
                          </td>
                          <td className="num">{money(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="note" style={{ padding: 16 }}>
                    Sin pagos registrados.
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>

      {printMode && (
        <div className="print-only">
          <RepairPrint repair={r} mode={printMode} />
        </div>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Editar orden ${fmtSeq(r.number)}`}
        width={860}
        footer={
          <>
            <Button onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={busy === "device"} onClick={saveDevice}>
              Guardar cambios
            </Button>
          </>
        }
      >
        {device && <DeviceFields value={device} onChange={setDevice} fields={fields} technicians={technicians} />}
      </Modal>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Registrar pago"
        width={420}
        footer={
          <>
            <Button onClick={() => setPayOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={busy === "pay"} onClick={pay}>
              Registrar
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="note">Saldo pendiente: {money(r.balance)}</p>
          <Field label="Monto" required error={fields.amount}>
            <Input autoFocus type="number" min={0} step="0.01" className="num" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </Field>
          <Field label="Método de pago" error={fields.method}>
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} options={PAY_METHODS} />
          </Field>
          <Field label="Notas" error={fields.notes}>
            <Input maxLength={255} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={deliverOpen}
        onClose={() => setDeliverOpen(false)}
        title="Entregar equipo"
        width={440}
        footer={
          <>
            <Button onClick={() => setDeliverOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={busy === "deliver"} onClick={deliver}>
              {r.balance > 0 ? "Cobrar y entregar" : "Confirmar entrega"}
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className={s.totals}>
            <div>
              <span>Total</span>
              <span className="num">{money(r.total)}</span>
            </div>
            <div>
              <span>Pagado</span>
              <span className="num">{money(r.paid)}</span>
            </div>
            <div className={s.grand}>
              <span>Saldo a cobrar</span>
              <span className="num">{money(r.balance)}</span>
            </div>
          </div>
          {r.balance > 0 ? (
            <div className="grid-2">
              <Field label="Monto recibido" error={fields["payment.amount"] ?? fields.amount ?? fields.payment}>
                <Input type="number" min={0} step="0.01" className="num" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </Field>
              <Field label="Método de pago">
                <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} options={PAY_METHODS} />
              </Field>
            </div>
          ) : (
            <p className="note">La orden está pagada.</p>
          )}
          <p className="note">
            La garantía de {r.warrantyDays} días empieza a contar desde hoy.
          </p>
        </div>
      </Modal>
    </>
  );
}

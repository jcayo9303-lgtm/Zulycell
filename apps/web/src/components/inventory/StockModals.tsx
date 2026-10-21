"use client";

import { useState, type FormEvent } from "react";
import { Alert, Badge, Button, Empty, Field, Input, Loading, Modal, SearchInput, Segmented, Select, Textarea, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtDateTime, fmtQty } from "@/lib/format";
import { STOCK_MOVEMENTS } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { SERIAL_STATUS, numOrNull, parseSerials, type Product, type SerialRow } from "./types";
import s from "./inventory.module.css";

type AdjustType = "IN" | "OUT" | "SET";

/** Ajuste manual de stock: merma, pérdida, conteo físico (docs §7) */
export function AdjustStockModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [type, setType] = useState<AdjustType>("IN");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Productos con IMEI: entrada = IMEI escritos; salida = IMEI elegidos de los que están en stock
  const [serialsText, setSerialsText] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [serialAction, setSerialAction] = useState<"DEFECTIVE" | "DELETE">("DEFECTIVE");
  const toast = useToast();
  const serialized = product.serialized;
  const inStock = useFetch(
    () =>
      serialized
        ? api.get<SerialRow[]>(`/products/${product.id}/serials`, { status: "IN_STOCK", variantId: variantId || undefined })
        : Promise.resolve([] as SerialRow[]),
    [product.id, variantId, serialized],
  );

  const variant = product.variants.find((v) => v.id === variantId);
  const current = variant ? variant.stock : product.stock;
  const typed = parseSerials(serialsText);
  const q = serialized ? (type === "IN" ? typed.length : picked.length) : numOrNull(quantity) ?? 0;
  const after = type === "IN" ? current + q : type === "OUT" ? current - q : q;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/products/${product.id}/adjust`, {
        variantId: variantId || null,
        type,
        quantity: q,
        reason,
        ...(serialized ? { serials: type === "IN" ? typed : picked, serialAction } : {}),
      });
      toast("Stock actualizado");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo ajustar el stock");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ajustar stock · ${product.name}`}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="adjust-form" loading={busy} disabled={serialized ? q === 0 : quantity === ""}>
            Guardar ajuste
          </Button>
        </>
      }
    >
      <form id="adjust-form" className="stack" onSubmit={submit}>
        {product.variants.length > 0 && (
          <Field label="Variante" required>
            <Select
              value={variantId}
              onChange={(e) => {
                setVariantId(e.target.value);
                setPicked([]);
              }}
              options={product.variants.map((v) => ({ value: v.id, label: `${v.type}: ${v.value}` }))}
            />
          </Field>
        )}
        <Field label="Tipo de ajuste" required hint={type === "SET" ? "Reemplaza el stock por la cantidad contada" : undefined}>
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: "IN", label: "Entrada" },
              { value: "OUT", label: "Salida" },
              ...(serialized ? [] : [{ value: "SET" as const, label: "Corrección" }]),
            ]}
          />
        </Field>
        {serialized && type === "IN" && (
          <Field label="IMEI que ingresan" required hint={`Uno por línea o escaneados. ${typed.length} IMEI.`}>
            <Textarea autoFocus className="mono" rows={5} value={serialsText} onChange={(e) => setSerialsText(e.target.value)} />
          </Field>
        )}
        {serialized && type === "OUT" && (
          <>
            <Field label="IMEI que salen" required hint={`${picked.length} seleccionado${picked.length === 1 ? "" : "s"}`}>
              {inStock.loading ? (
                <Loading />
              ) : !inStock.data?.length ? (
                <span className="note">No hay IMEI en stock.</span>
              ) : (
                <div className={s.serialPick}>
                  {inStock.data.map((r) => (
                    <label key={r.id} className="row">
                      <input
                        type="checkbox"
                        checked={picked.includes(r.serial)}
                        onChange={(e) =>
                          setPicked((p) => (e.target.checked ? [...p, r.serial] : p.filter((x) => x !== r.serial)))
                        }
                      />
                      <span className="mono">{r.serial}</span>
                    </label>
                  ))}
                </div>
              )}
            </Field>
            <Field label="Qué hacer con estos IMEI">
              <Select
                value={serialAction}
                onChange={(e) => setSerialAction(e.target.value as "DEFECTIVE" | "DELETE")}
                options={[
                  { value: "DEFECTIVE", label: "Marcar como defectuoso / baja (conserva historial)" },
                  { value: "DELETE", label: "Eliminar el registro (cargado por error)" },
                ]}
              />
            </Field>
          </>
        )}
        {!serialized && (
        <Field label={type === "SET" ? "Stock real contado" : "Cantidad"} required>
          <Input
            autoFocus
            type="number"
            min={type === "SET" ? 0 : 0.001}
            step={product.unit === "UNIT" || product.unit === "BOX" ? "1" : "0.001"}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        )}
        <Field label="Motivo" hint="Merma, robo, conteo físico…">
          <Input maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className={s.stat}>
          <span className="muted">Stock actual → resultado</span>
          <span className={s.statValue}>
            {fmtQty(current, product.unit)} → <span className={after < 0 ? s.negative : undefined}>{fmtQty(after, product.unit)}</span>
          </span>
        </div>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

type Movement = {
  id: string;
  type: keyof typeof STOCK_MOVEMENTS;
  quantity: number;
  stockAfter: number;
  reason: string | null;
  variant: string | null;
  createdAt: string;
};

/** Kardex: historial de movimientos de stock del producto */
export function KardexModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { me } = useSession();
  const { data, loading, error } = useFetch(() => api.get<Movement[]>(`/products/${product.id}/movements`), [product.id]);

  return (
    <Modal open onClose={onClose} title={`Movimientos · ${product.name}`} width={760}>
      {loading ? (
        <Loading />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : !data?.length ? (
        <Empty title="Sin movimientos">Los movimientos aparecen al vender, comprar o ajustar el stock.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                {product.variants.length > 0 && <th>Variante</th>}
                <th className="num">Cantidad</th>
                <th className="num">Stock</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id}>
                  <td>{fmtDateTime(m.createdAt, me.business.timezone)}</td>
                  <td>{STOCK_MOVEMENTS[m.type] ?? m.type}</td>
                  {product.variants.length > 0 && <td>{m.variant ?? "—"}</td>}
                  <td className={`num ${m.quantity >= 0 ? s.positive : s.negative}`}>
                    {m.quantity > 0 ? "+" : ""}
                    {fmtQty(m.quantity, product.unit)}
                  </td>
                  <td className="num">{fmtQty(m.stockAfter, product.unit)}</td>
                  <td className="muted">{m.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/** IMEI / números de serie del producto con su estado */
export function SerialsModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { me } = useSession();
  const [status, setStatus] = useState<SerialRow["status"] | "">("IN_STOCK");
  const [q, setQ] = useState("");
  const { data, loading, error } = useFetch(
    () => api.get<SerialRow[]>(`/products/${product.id}/serials`, { status: status || undefined, q: q || undefined }),
    [product.id, status, q],
  );
  const tone = (st: SerialRow["status"]) => (st === "IN_STOCK" ? "success" : st === "SOLD" ? "info" : "danger");

  return (
    <Modal open onClose={onClose} title={`IMEI · ${product.name}`} width={680}>
      <div className="stack">
        <div className="row wrap">
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "IN_STOCK", label: "En stock" },
              { value: "SOLD", label: "Vendidos" },
              { value: "DEFECTIVE", label: "Baja" },
              { value: "", label: "Todos" },
            ]}
          />
          <div className="grow">
            <SearchInput placeholder="Buscar IMEI" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <Alert>{error}</Alert>
        ) : !data?.length ? (
          <Empty title="Sin IMEI">Ingresa unidades con «Ajustar stock» → Entrada o registrando una compra.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>IMEI / serie</th>
                  {product.variants.length > 0 && <th>Variante</th>}
                  <th>Estado</th>
                  <th>Ingreso</th>
                  <th>Vendido</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.serial}</td>
                    {product.variants.length > 0 && <td>{r.variant ?? "—"}</td>}
                    <td>
                      <Badge tone={tone(r.status)}>{SERIAL_STATUS[r.status]}</Badge>
                    </td>
                    <td>{fmtDateTime(r.createdAt, me.business.timezone)}</td>
                    <td>{r.soldAt ? fmtDateTime(r.soldAt, me.business.timezone) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

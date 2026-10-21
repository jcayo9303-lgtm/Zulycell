"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { ScanLine, Trash2, X } from "lucide-react";
import s from "./pos.module.css";
import { cartTotals, lineSubtotal, toPayloadItem, type CartLine, type DiscountType } from "./cart";
import {
  Alert,
  Button,
  Card,
  Combobox,
  Empty,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { BarcodeScanner } from "@/components/sales/BarcodeScanner";
import { CashNotice } from "@/components/sales/CashNotice";
import { Receipt } from "@/components/sales/Receipt";
import { SerialPicker } from "./SerialPicker";
import type { ClientLite, Product, SaleDetail, Variant } from "@/components/sales/types";
import { api, ApiError, type Paginated } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/hooks";
import { fmtQty, fmtSeq, round2 } from "@/lib/format";
import { PAYMENT_METHODS, options, type PaymentMethod } from "@/lib/labels";
import { useSession } from "@/lib/session";

const DISCOUNT_OPTIONS = [
  { value: "AMOUNT", label: "$" },
  { value: "PERCENT", label: "%" },
];

type NewClientOption = ClientLite & { isNew?: boolean };

const isLow = (p: { trackStock: boolean; stock: number; lowStockAlert: number; isRecipe: boolean }) =>
  p.trackStock && !p.isRecipe && p.stock <= p.lowStockAlert;

export default function SellPage() {
  const { money, me } = useSession();
  const toast = useToast();
  const symbol = me.business.currencySymbol;

  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 200);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const products = useFetch(() => api.get<Paginated<Product>>("/products", { q: debounced, pageSize: 48 }), [debounced]);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>("AMOUNT");
  const [discountValue, setDiscountValue] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [received, setReceived] = useState("");
  const [client, setClient] = useState<ClientLite | null>(null);
  const [notes, setNotes] = useState("");

  const [variantFor, setVariantFor] = useState<Product | null>(null);
  const [serialFor, setSerialFor] = useState<{ product: Product; variant: Variant | null } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SaleDetail | null>(null);

  const totals = cartTotals(lines, discountType, discountValue);
  const receivedNum = Number(received) || 0;
  const change = method === "CASH" && received !== "" ? round2(receivedNum - totals.total) : null;

  const addLine = useCallback((p: Product, variant: Variant | null, serials: string[] = []) => {
    setLines((prev) => {
      const key = `${p.id}:${variant?.id ?? ""}`;
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        if (existing.serialized) {
          const merged = [...new Set([...existing.serials, ...serials])];
          return prev.map((l) => (l.key === key ? { ...l, serials: merged, quantity: String(merged.length) } : l));
        }
        return prev.map((l) => (l.key === key ? { ...l, quantity: String(round2(Number(l.quantity) + 1)) } : l));
      }
      return [
        ...prev,
        {
          key,
          productId: p.id,
          variantId: variant?.id ?? null,
          name: variant ? `${p.name} · ${variant.value}` : p.name,
          unit: p.unit,
          quantity: p.serialized ? String(serials.length) : "1",
          unitPrice: String(variant?.price ?? p.price),
          discountType: "AMOUNT",
          discountValue: "",
          stock: p.trackStock && !p.isRecipe ? (variant ? variant.stock : p.stock) : null,
          serialized: Boolean(p.serialized),
          serials,
        },
      ];
    });
  }, []);

  // Con IMEI: primero se eligen las unidades exactas que se venden
  const choose = useCallback(
    (p: Product, variant: Variant | null) => {
      if (p.serialized) setSerialFor({ product: p, variant });
      else addLine(p, variant);
    },
    [addLine],
  );

  const pick = (p: Product) => {
    const variants = p.variants ?? [];
    if (variants.length > 0) setVariantFor(p);
    else choose(p, null);
  };

  const removeSerial = (key: string, serial: string) =>
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.key !== key) return [l];
        const serials = l.serials.filter((x) => x !== serial);
        return serials.length ? [{ ...l, serials, quantity: String(serials.length) }] : [];
      }),
    );

  /** IMEI escaneado: agrega directo esa unidad */
  const addBySerial = useCallback(
    async (code: string) => {
      try {
        const r = await api.get<{ product: Product; variantId: string | null; serial: string; status: string }>(
          `/warranty/serial/${encodeURIComponent(code)}`,
        );
        if (r.status !== "IN_STOCK") {
          toast(`El IMEI ${r.serial} no está disponible (ya fue vendido o dado de baja).`, true);
          return true;
        }
        const variant = r.variantId ? r.product.variants.find((v) => v.id === r.variantId) ?? null : null;
        addLine(r.product, variant, [r.serial]);
        setQ("");
        return true;
      } catch {
        return false;
      }
    },
    [addLine, toast],
  );

  const addByBarcode = useCallback(
    async (code: string) => {
      // Un IMEI tiene 15 dígitos; los códigos EAN/UPC entre 8 y 14
      const looksLikeImei = !/^\d{8,14}$/.test(code);
      if (looksLikeImei && (await addBySerial(code))) return true;
      try {
        const r = await api.get<{ product: Product; variantId: string | null }>(`/products/barcode/${encodeURIComponent(code)}`);
        const variant = r.variantId ? r.product.variants.find((v) => v.id === r.variantId) ?? null : null;
        if (!variant && r.product.variants?.length) setVariantFor(r.product);
        else choose(r.product, variant);
        setQ("");
        return true;
      } catch {
        if (!looksLikeImei && (await addBySerial(code))) return true;
        toast(`No hay ningún producto ni IMEI con el código ${code}`, true);
        return false;
      }
    },
    [addBySerial, choose, toast],
  );

  // Lector USB/Bluetooth: escribe el código y envía Enter en el buscador
  const onSearchKey = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const value = q.trim();
    if (/^\d{8,17}$/.test(value) || /^[A-Za-z0-9-]{10,30}$/.test(value.replace(/\s+/g, "")) && /\d{6,}/.test(value)) {
      await addByBarcode(value.replace(/\s+/g, ""));
      return;
    }
    const items = products.data?.items ?? [];
    if (items.length === 1) {
      pick(items[0]);
      setQ("");
    }
  };

  const onScanned = useCallback(
    (code: string) => {
      setScanOpen(false);
      void addByBarcode(code);
    },
    [addByBarcode],
  );

  const update = (key: string, patch: Partial<CartLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const reset = () => {
    setLines([]);
    setDiscountType("AMOUNT");
    setDiscountValue("");
    setMethod("CASH");
    setReceived("");
    setClient(null);
    setNotes("");
    setError(null);
  };

  const confirmSale = async () => {
    setError(null);
    if (!lines.length) return setError("Agrega al menos un producto.");
    if (method === "CREDIT" && !client) return setError("Selecciona el cliente para vender a crédito.");
    if (change !== null && change < 0) return setError("El monto recibido es menor al total.");
    setBusy(true);
    try {
      const dv = Number(discountValue) || 0;
      const sale = await api.post<{ id: string }>("/sales", {
        items: lines.map(toPayloadItem),
        discountType: dv > 0 ? discountType : null,
        discountValue: dv > 0 ? dv : null,
        method,
        received: method === "CASH" && received !== "" ? receivedNum : null,
        clientId: client?.id ?? null,
        notes: notes || null,
      });
      setDone(await api.get<SaleDetail>(`/sales/${sale.id}`));
      reset();
      void products.reload();
    } catch (e) {
      if (e instanceof ApiError) {
        const fieldMsg = e.fields ? Object.values(e.fields)[0] : null;
        setError(fieldMsg ? `${e.message} ${fieldMsg}` : e.message);
      } else setError("No se pudo registrar la venta.");
    } finally {
      setBusy(false);
    }
  };

  const newSale = () => {
    setDone(null);
    setTimeout(() => searchBoxRef.current?.querySelector("input")?.focus(), 50);
  };

  const fetchClients = async (term: string): Promise<NewClientOption[]> => {
    const r = await api.get<Paginated<ClientLite>>("/clients", { q: term, pageSize: 8 });
    const t = term.trim();
    return t ? [...r.items, { id: "", name: t, phone: null, isNew: true }] : r.items;
  };

  const chooseClient = async (c: NewClientOption) => {
    if (!c.isNew) return setClient(c);
    try {
      const created = await api.post<ClientLite>("/clients", { name: c.name });
      setClient(created);
      toast(`Cliente "${created.name}" creado`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo crear el cliente", true);
    }
  };

  const items = products.data?.items ?? [];

  return (
    <>
      <PageHeader title="Vender" subtitle="Busca, escanea o toca un producto para agregarlo" />
      <CashNotice />

      <div className={s.layout}>
        <section className={s.catalog}>
          <div className={s.searchRow} ref={searchBoxRef}>
            <SearchInput
              autoFocus
              placeholder="Buscar por nombre, código de barras, modelo o IMEI"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onSearchKey}
            />
            <Button icon={<ScanLine size={15} />} onClick={() => setScanOpen(true)}>
              Escanear
            </Button>
          </div>

          {products.loading && !products.data ? (
            <Loading />
          ) : products.error ? (
            <Alert>{products.error}</Alert>
          ) : !items.length ? (
            <Card>
              <Empty title={q ? "Sin resultados" : "Aún no tienes productos"}>
                {q ? "Prueba con otro nombre o código." : "Crea productos en Inventario para venderlos aquí."}
              </Empty>
            </Card>
          ) : (
            <div className={s.grid}>
              {items.map((p) => {
                const out = p.trackStock && !p.isRecipe && p.stock <= 0;
                return (
                  <button key={p.id} type="button" className={`${s.product} ${out ? s.productDisabled : ""}`} onClick={() => pick(p)}>
                    <div className={s.thumb} style={p.imageUrl ? { backgroundImage: `url("${p.imageUrl}")` } : undefined}>
                      {!p.imageUrl && p.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className={s.productBody}>
                      <span className={s.productName}>{p.name}</span>
                      <span className={s.productPrice}>{money(p.price)}</span>
                      {p.trackStock && !p.isRecipe ? (
                        <span className={`${s.stock} ${isLow(p) ? s.stockLow : ""}`}>
                          {out ? "Sin stock" : `Stock: ${fmtQty(p.stock, p.unit)}`}
                        </span>
                      ) : (
                        <span className={s.stock}>{p.isRecipe ? "Receta" : "Sin control de stock"}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <Card
          className={s.cart}
          flush
          title={`Venta actual${lines.length ? ` · ${lines.length}` : ""}`}
          actions={
            lines.length > 0 && (
              <Button size="sm" variant="ghost" onClick={reset}>
                Cancelar
              </Button>
            )
          }
        >
          <div className={s.cartLines}>
            {!lines.length ? (
              <Empty title="Carrito vacío">Agrega productos desde la lista.</Empty>
            ) : (
              lines.map((l) => {
                const sub = lineSubtotal(l);
                const qtyNum = Number(l.quantity) || 0;
                const over = l.stock !== null && qtyNum > l.stock;
                return (
                  <div key={l.key} className={s.line}>
                    <div className={s.lineHead}>
                      <span>{l.name}</span>
                      <Button size="sm" variant="ghost" aria-label="Quitar" icon={<X size={14} />} onClick={() => remove(l.key)} />
                    </div>
                    <div className={s.lineInputs}>
                      <Input
                        type="number"
                        inputMode="decimal"
                        aria-label="Cantidad"
                        min={l.unit === "UNIT" ? 1 : 0.001}
                        step={l.unit === "UNIT" ? 1 : 0.001}
                        value={l.quantity}
                        readOnly={l.serialized}
                        title={l.serialized ? "La cantidad es la cantidad de IMEI elegidos" : undefined}
                        invalid={over || qtyNum <= 0}
                        onChange={(e) => update(l.key, { quantity: e.target.value })}
                      />
                      <Input
                        type="number"
                        inputMode="decimal"
                        aria-label="Precio unitario"
                        min="0.01"
                        step="0.01"
                        value={l.unitPrice}
                        onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                      />
                      <div className={s.discount}>
                        <Select
                          aria-label="Tipo de descuento"
                          value={l.discountType}
                          options={DISCOUNT_OPTIONS.map((o) => (o.value === "AMOUNT" ? { ...o, label: symbol } : o))}
                          onChange={(e) => update(l.key, { discountType: e.target.value as DiscountType })}
                        />
                        <Input
                          type="number"
                          inputMode="decimal"
                          aria-label="Descuento"
                          placeholder="Desc."
                          min="0"
                          step="0.01"
                          value={l.discountValue}
                          onChange={(e) => update(l.key, { discountValue: e.target.value })}
                        />
                      </div>
                    </div>
                    {l.serialized && (
                      <div className={s.serialChips}>
                        {l.serials.map((serial) => (
                          <span key={serial} className={s.serialChip}>
                            <span className="mono">{serial}</span>
                            <button type="button" aria-label={`Quitar IMEI ${serial}`} onClick={() => removeSerial(l.key, serial)}>
                              ×
                            </button>
                          </span>
                        ))}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const p = items.find((x) => x.id === l.productId);
                            const v = p?.variants.find((x) => x.id === l.variantId) ?? null;
                            if (p) setSerialFor({ product: p, variant: v });
                            else toast("Busca el producto para agregar más IMEI", true);
                          }}
                        >
                          + IMEI
                        </Button>
                      </div>
                    )}
                    <div className={s.lineFoot}>
                      <span className={over ? "text-danger" : undefined}>
                        {l.stock !== null ? `Disponible: ${fmtQty(l.stock, l.unit)}` : "Cant. · Precio · Desc."}
                      </span>
                      <span className={s.lineSubtotal}>{money(sub)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className={s.summary}>
            <div className={s.sumLine}>
              <span>Subtotal</span>
              <span>{money(totals.subtotal)}</span>
            </div>
            <div className="row">
              <span className="muted grow">Descuento global</span>
              <div className={s.discount} style={{ width: 150 }}>
                <Select
                  aria-label="Tipo de descuento global"
                  value={discountType}
                  options={DISCOUNT_OPTIONS.map((o) => (o.value === "AMOUNT" ? { ...o, label: symbol } : o))}
                  onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={discountType === "PERCENT" ? 100 : undefined}
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  aria-label="Descuento global"
                />
              </div>
            </div>
            {totals.discountTotal > 0 && (
              <div className={s.sumLine}>
                <span>Descuento</span>
                <span>−{money(totals.discountTotal)}</span>
              </div>
            )}
            <div className={s.total}>
              <span className={s.totalLabel}>Total a cobrar</span>
              <span className={s.totalValue}>{money(totals.total)}</span>
            </div>

            <Field label="Método de pago" required>
              <Select
                value={method}
                options={options(PAYMENT_METHODS)}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              />
            </Field>

            {method === "CASH" && (
              <div className="grid-2">
                <Field label="Monto recibido">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={totals.total}
                    step="0.01"
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                  />
                </Field>
                <Field label="Vuelto / cambio">
                  <div className={`${s.change} ${change !== null && change < 0 ? "text-danger" : ""}`} style={{ paddingTop: 6 }}>
                    {change === null ? "—" : money(change)}
                  </div>
                </Field>
              </div>
            )}

            <Field label="Cliente" required={method === "CREDIT"} hint={method === "CREDIT" ? "La venta se suma a su deuda" : undefined}>
              <Combobox<NewClientOption>
                value={client?.name}
                onClear={() => setClient(null)}
                placeholder="Buscar o crear cliente"
                fetcher={fetchClients}
                renderItem={(c) => (c.isNew ? <strong>+ Crear cliente “{c.name}”</strong> : <>{c.name}{c.phone ? <span className="note"> · {c.phone}</span> : null}</>)}
                onSelect={chooseClient}
              />
            </Field>

            <Field label="Notas">
              <Textarea rows={2} maxLength={255} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            {error && <Alert>{error}</Alert>}

            <Button variant="primary" size="lg" block loading={busy} disabled={!lines.length} onClick={confirmSale}>
              Confirmar venta · {money(totals.total)}
            </Button>
            {lines.length > 0 && (
              <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={reset}>
                Cancelar venta
              </Button>
            )}
          </div>
        </Card>
      </div>

      <Modal open={Boolean(variantFor)} onClose={() => setVariantFor(null)} title={variantFor ? `Elige la variante · ${variantFor.name}` : ""}>
        {variantFor && (
          <div className={s.variants}>
            {variantFor.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                className={s.variant}
                onClick={() => {
                  choose(variantFor, v);
                  setVariantFor(null);
                }}
              >
                <span className="note">{v.type}</span>
                <strong>{v.value}</strong>
                <span>{money(v.price ?? variantFor.price)}</span>
                {variantFor.trackStock && (
                  <span className={`${s.stock} ${v.stock <= 0 ? s.stockLow : ""}`}>Stock: {fmtQty(v.stock, variantFor.unit)}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </Modal>

      {serialFor && (
        <SerialPicker
          product={serialFor.product}
          variant={serialFor.variant}
          taken={lines.flatMap((l) => l.serials)}
          onClose={() => setSerialFor(null)}
          onConfirm={(serials) => {
            addLine(serialFor.product, serialFor.variant, serials);
            setSerialFor(null);
          }}
        />
      )}

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onScanned} />

      <Modal open={Boolean(done)} onClose={newSale} title={done ? `Venta registrada · #${fmtSeq(done.number)}` : ""} width={440}>
        {done && (
          <Receipt
            sale={done}
            actions={
              <Button variant="primary" onClick={newSale}>
                Nueva venta
              </Button>
            }
          />
        )}
      </Modal>
    </>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  ImageUpload,
  Input,
  Modal,
  Select,
  Tabs,
  Textarea,
  Toggle,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fmtPercent, fmtQty } from "@/lib/format";
import { UNITS, VARIANT_TYPES, options, type Unit } from "@/lib/labels";
import { BarcodeScanButton } from "./BarcodeScanButton";
import { numOrNull, parseSerials, type Category, type Product } from "./types";
import s from "./inventory.module.css";

type VariantRow = { id?: string; type: string; value: string; price: string; cost: string; stock: string; barcode: string; currentStock?: number };

type FormState = {
  name: string;
  barcode: string;
  categoryId: string;
  newCategory: string;
  imageKey: string | null;
  imageUrl: string | null;
  description: string;
  cost: string;
  price: string;
  stock: string;
  lowStockAlert: string;
  unit: Unit;
  trackStock: boolean;
  visibleInCatalog: boolean;
  variants: VariantRow[];
  brand: string;
  compatibleWith: string;
  warrantyDays: string;
  serialized: boolean;
  serialsText: string;
};

const NEW_CATEGORY = "__new__";
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function initialState(p: Product | null): FormState {
  return {
    name: p?.name ?? "",
    barcode: p?.barcode ?? "",
    categoryId: p?.categoryId ?? "",
    newCategory: "",
    imageKey: p?.imageKey ?? null,
    imageUrl: p?.imageUrl ?? null,
    description: p?.description ?? "",
    cost: p ? str(p.cost) : "",
    price: p ? str(p.price) : "",
    stock: "",
    lowStockAlert: p ? str(p.lowStockAlert) : "5",
    unit: p?.unit ?? "UNIT",
    trackStock: p?.trackStock ?? true,
    visibleInCatalog: p?.visibleInCatalog ?? true,
    brand: p?.brand ?? "",
    compatibleWith: p?.compatibleWith ?? "",
    warrantyDays: p ? String(p.warrantyDays) : "0",
    serialized: p?.serialized ?? false,
    serialsText: "",
    variants:
      p?.variants.map((v) => ({
        id: v.id,
        type: v.type,
        value: v.value,
        price: str(v.price),
        cost: str(v.cost),
        stock: "",
        barcode: v.barcode ?? "",
        currentStock: v.stock,
      })) ?? [],
  };
}

type Tab = "basic" | "prices" | "variants";

export function ProductForm({
  product,
  categories,
  brands = [],
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: Category[];
  /** Marcas existentes para autocompletar */
  brands?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<Tab>("basic");
  const [f, setF] = useState<FormState>(() => initialState(product));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const toast = useToast();
  const confirm = useConfirm();
  const isEdit = Boolean(product);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const setVariant = (i: number, patch: Partial<VariantRow>) =>
    setF((prev) => ({ ...prev, variants: prev.variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) }));

  const price = numOrNull(f.price);
  const cost = numOrNull(f.cost);
  const margin = price && cost ? ((price - cost) / cost) * 100 : null;
  const stepQty = f.unit === "UNIT" || f.unit === "BOX" ? "1" : "0.001";
  const serials = parseSerials(f.serialsText);
  // Al crear un producto con IMEI sin variantes, el stock inicial es la cantidad de IMEI ingresados
  const askSerials = !isEdit && f.serialized && !f.variants.length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    const body = {
      name: f.name,
      barcode: f.barcode,
      categoryId: f.categoryId === NEW_CATEGORY ? null : f.categoryId || null,
      categoryName: f.categoryId === NEW_CATEGORY ? f.newCategory : null,
      imageKey: f.imageKey,
      description: f.description,
      cost,
      price,
      stock: isEdit ? null : askSerials ? serials.length : numOrNull(f.stock),
      brand: f.brand,
      compatibleWith: f.compatibleWith,
      warrantyDays: numOrNull(f.warrantyDays) ?? 0,
      serialized: f.serialized,
      serials: askSerials ? serials : [],
      lowStockAlert: numOrNull(f.lowStockAlert),
      unit: f.unit,
      trackStock: f.trackStock,
      visibleInCatalog: f.visibleInCatalog,
      variants: f.variants.map((v) => ({
        id: v.id,
        type: v.type,
        value: v.value,
        price: numOrNull(v.price),
        cost: numOrNull(v.cost),
        stock: v.id || f.serialized ? null : numOrNull(v.stock),
        barcode: v.barcode,
      })),
    };
    try {
      if (product) await api.put(`/products/${product.id}`, body);
      else await api.post("/products", body);
      toast(isEdit ? "Producto actualizado" : "Producto creado");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
        const keys = Object.keys(err.fields ?? {});
        if (keys.some((k) => k.startsWith("variants"))) setTab("variants");
        else if (keys.some((k) => ["price", "cost", "stock", "lowStockAlert", "serials", "warrantyDays"].includes(k))) setTab("prices");
        else if (keys.length) setTab("basic");
      } else setError("No se pudo guardar el producto.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!product || !confirm(`¿Eliminar "${product.name}"? Dejará de aparecer en el POS y el catálogo.`)) return;
    setBusy(true);
    try {
      await api.del(`/products/${product.id}`);
      toast("Producto eliminado");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={680}
      title={isEdit ? "Editar producto" : "Crear producto"}
      footer={
        <>
          {isEdit && (
            <Button variant="danger" onClick={remove} disabled={busy} style={{ marginRight: "auto" }}>
              Eliminar producto
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="product-form" loading={busy}>
            Guardar producto
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "basic", label: "Información básica" },
            { value: "prices", label: "Precios y stock" },
            { value: "variants", label: `Variantes${f.variants.length ? ` (${f.variants.length})` : ""}` },
          ]}
        />

        <div className={s.formBody} hidden={tab !== "basic"}>
          <Field label="Nombre del producto" required error={fields.name}>
            <Input autoFocus maxLength={100} value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label="Código de barras" hint="EAN-13 (13 dígitos) o UPC-A (12)" error={fields.barcode}>
              <div className="row">
                <Input
                  className="mono"
                  inputMode="numeric"
                  maxLength={13}
                  value={f.barcode}
                  onChange={(e) => set("barcode", e.target.value.replace(/\D/g, ""))}
                />
                <BarcodeScanButton onDetect={(code) => set("barcode", code)} />
              </div>
            </Field>
            <Field label="Categoría" error={fields.categoryId ?? fields.categoryName}>
              <Select
                value={f.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
                placeholder="Sin categoría"
                options={[...categories.map((c) => ({ value: c.id, label: c.name })), { value: NEW_CATEGORY, label: "+ Nueva categoría" }]}
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Marca" error={fields.brand}>
              <Input list="brand-list" maxLength={60} placeholder="Samsung, Apple, Xiaomi…" value={f.brand} onChange={(e) => set("brand", e.target.value)} />
            </Field>
            <Field label="Compatible con" hint="Modelos separados por coma" error={fields.compatibleWith}>
              <Input maxLength={255} placeholder="iPhone 13, iPhone 13 Pro" value={f.compatibleWith} onChange={(e) => set("compatibleWith", e.target.value)} />
            </Field>
          </div>
          <datalist id="brand-list">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          {f.categoryId === NEW_CATEGORY && (
            <Field label="Nombre de la nueva categoría" required>
              <Input maxLength={60} value={f.newCategory} onChange={(e) => set("newCategory", e.target.value)} />
            </Field>
          )}
          <Field label="Foto del producto">
            <ImageUpload
              folder="products"
              url={f.imageUrl}
              onChange={(img) => setF((prev) => ({ ...prev, imageKey: img?.key ?? null, imageUrl: img?.url ?? null }))}
            />
          </Field>
          <Field label="Descripción" hint={`${f.description.length}/500 · visible en el catálogo virtual`} error={fields.description}>
            <Textarea maxLength={500} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Toggle checked={f.visibleInCatalog} onChange={(v) => set("visibleInCatalog", v)} label="Mostrar en el catálogo virtual" />
        </div>

        <div className={s.formBody} hidden={tab !== "prices"}>
          <div className="grid-3">
            <Field label="Precio de costo" error={fields.cost}>
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={f.cost} onChange={(e) => set("cost", e.target.value)} />
            </Field>
            <Field label="Precio de venta" required error={fields.price}>
              <Input type="number" min={0.01} step="0.01" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field label="Margen de ganancia" hint="((venta − costo) / costo) × 100">
              <Input value={fmtPercent(margin)} readOnly disabled />
            </Field>
          </div>
          <div className="grid-3">
            <Field label="Unidad de medida" error={fields.unit} hint={f.serialized ? "Con IMEI siempre es por unidad" : undefined}>
              <Select value={f.unit} disabled={f.serialized} onChange={(e) => set("unit", e.target.value as Unit)} options={options(UNITS)} />
            </Field>
            {askSerials ? (
              <Field label="Cantidad en stock" hint="Se calcula con los IMEI ingresados">
                <Input value={String(serials.length)} readOnly disabled className="num" />
              </Field>
            ) : isEdit || f.variants.length ? (
              <Field label="Cantidad en stock" hint={f.variants.length ? "Suma de las variantes" : "Para cambiarlo usa «Ajustar stock»"}>
                <Input value={product ? fmtQty(product.stock, product.unit) : "—"} readOnly disabled />
              </Field>
            ) : (
              <Field label="Cantidad en stock" error={fields.stock}>
                <Input type="number" min={0} step={stepQty} value={f.stock} onChange={(e) => set("stock", e.target.value)} />
              </Field>
            )}
            <Field label="Alerta de stock bajo" hint="Se resalta en rojo al llegar a este valor" error={fields.lowStockAlert}>
              <Input type="number" min={0} step={stepQty} value={f.lowStockAlert} onChange={(e) => set("lowStockAlert", e.target.value)} />
            </Field>
          </div>
          <div className="grid-3">
            <Field label="Garantía al cliente (días)" hint="0 = sin garantía. Se imprime en el comprobante" error={fields.warrantyDays}>
              <Input type="number" min={0} max={3650} step="1" value={f.warrantyDays} onChange={(e) => set("warrantyDays", e.target.value)} />
            </Field>
          </div>
          <Toggle checked={f.trackStock} disabled={f.serialized} onChange={(v) => set("trackStock", v)} label="Controlar stock de este producto" />
          <Toggle
            checked={f.serialized}
            disabled={isEdit && product?.serialized}
            onChange={(v) => setF((prev) => ({ ...prev, serialized: v, ...(v ? { unit: "UNIT" as Unit, trackStock: true } : {}) }))}
            label="Controlar por IMEI / número de serie (celulares, tablets)"
          />
          {f.serialized && isEdit && !product?.serialized && product && product.stock > 0 && (
            <Alert tone="info">
              Este producto ya tiene stock. Para controlarlo por IMEI primero deja el stock en 0 con «Ajustar stock» y luego ingresa
              cada unidad con su IMEI.
            </Alert>
          )}
          {askSerials && (
            <Field
              label="IMEI del stock inicial"
              hint={`Uno por línea (también puedes escanearlos). ${serials.length} ingresado${serials.length === 1 ? "" : "s"}.`}
              error={fields.serials}
            >
              <Textarea
                className="mono"
                rows={5}
                placeholder={"356789012345678\n356789012345679"}
                value={f.serialsText}
                onChange={(e) => set("serialsText", e.target.value)}
              />
            </Field>
          )}
          {f.serialized && !askSerials && !isEdit && (
            <p className="note">Con variantes, registra los IMEI de cada variante después de crear el producto (Ajustar stock → Entrada).</p>
          )}
        </div>

        <div className={s.formBody} hidden={tab !== "variants"}>
          <p className="note">
            Sub-versiones del producto (talla, color, presentación). Cada variante lleva su propio stock; el precio y el costo
            son opcionales si difieren del producto base.
          </p>
          {f.variants.length > 0 && (
            <div className="table-wrap">
              <table className={`table ${s.variantTable}`}>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Valor</th>
                    <th className="num">Precio</th>
                    <th className="num">Costo</th>
                    <th className="num">Stock</th>
                    <th>Código</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {f.variants.map((v, i) => (
                    <tr key={v.id ?? `new-${i}`}>
                      <td>
                        <Input list="variant-types" maxLength={30} value={v.type} onChange={(e) => setVariant(i, { type: e.target.value })} invalid={Boolean(fields[`variants.${i}.type`])} />
                      </td>
                      <td>
                        <Input maxLength={50} placeholder="XL, Rojo, 500 ml" value={v.value} onChange={(e) => setVariant(i, { value: e.target.value })} invalid={Boolean(fields[`variants.${i}.value`])} />
                      </td>
                      <td>
                        <Input type="number" min={0.01} step="0.01" placeholder="Base" value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} />
                      </td>
                      <td>
                        <Input type="number" min={0} step="0.01" placeholder="Base" value={v.cost} onChange={(e) => setVariant(i, { cost: e.target.value })} />
                      </td>
                      <td>
                        {v.id || f.serialized ? (
                          <Input value={v.id ? fmtQty(v.currentStock, f.unit) : "Por IMEI"} readOnly disabled className="num" />
                        ) : (
                          <Input type="number" min={0} step={stepQty} value={v.stock} onChange={(e) => setVariant(i, { stock: e.target.value })} />
                        )}
                      </td>
                      <td>
                        <Input className="mono" inputMode="numeric" maxLength={13} value={v.barcode} onChange={(e) => setVariant(i, { barcode: e.target.value.replace(/\D/g, "") })} invalid={Boolean(fields[`variants.${i}.barcode`])} />
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Eliminar variante"
                          icon={<Trash2 size={14} />}
                          onClick={() => setF((prev) => ({ ...prev, variants: prev.variants.filter((_, idx) => idx !== i) }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id="variant-types">
                {VARIANT_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          )}
          <div>
            <Button
              icon={<Plus size={14} />}
              onClick={() =>
                setF((prev) => ({
                  ...prev,
                  variants: [...prev.variants, { type: prev.variants.at(-1)?.type ?? "Talla", value: "", price: "", cost: "", stock: "", barcode: "" }],
                }))
              }
            >
              Agregar variante
            </Button>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 12 }}>
            <Alert>{error}</Alert>
          </div>
        )}
      </form>
    </Modal>
  );
}

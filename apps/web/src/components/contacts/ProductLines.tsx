"use client";

import { Plus, Trash2 } from "lucide-react";
import s from "./contacts.module.css";
import { Button, Combobox, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { round2 } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { ProductOption } from "./types";

export type Line = {
  key: string;
  productId: string | null;
  variantId: string | null;
  name: string;
  quantity: string;
  price: string;
  discountType: "AMOUNT" | "PERCENT";
  discountValue: string;
  taxRate: string;
  /** Producto controlado por IMEI (compras: se piden los IMEI) */
  serialized?: boolean;
};

/** quote: descuento por ítem · purchase: costo de compra · invoice: descuento + impuesto */
export type LinesMode = "quote" | "purchase" | "invoice";

export const newLine = (partial: Partial<Line> = {}): Line => ({
  key: Math.random().toString(36).slice(2),
  productId: null,
  variantId: null,
  name: "",
  quantity: "1",
  price: "",
  discountType: "AMOUNT",
  discountValue: "",
  taxRate: "0",
  ...partial,
});

export function lineGross(l: Line) {
  return round2((Number(l.quantity) || 0) * (Number(l.price) || 0));
}

export function lineDiscount(l: Line, mode: LinesMode) {
  if (mode === "purchase") return 0;
  const gross = lineGross(l);
  const v = Number(l.discountValue) || 0;
  const raw = mode === "quote" && l.discountType === "PERCENT" ? (gross * Math.min(v, 100)) / 100 : v;
  return round2(Math.min(Math.max(raw, 0), gross));
}

export const lineSubtotal = (l: Line, mode: LinesMode) => round2(lineGross(l) - lineDiscount(l, mode));

type Option = { product: ProductOption; variant: ProductOption["variants"][number] | null };

async function searchProducts(q: string): Promise<Option[]> {
  const r = await api.get<{ items: ProductOption[] }>("/products", { q, pageSize: 20 });
  return r.items.flatMap((p): Option[] =>
    p.variants?.length ? p.variants.map((v) => ({ product: p, variant: v })) : [{ product: p, variant: null }],
  );
}

export function ProductLines({
  lines,
  onChange,
  mode,
  taxRates = [0],
  allowFree,
}: {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  mode: LinesMode;
  taxRates?: number[];
  allowFree?: boolean;
}) {
  const { money } = useSession();
  const update = (key: string, patch: Partial<Line>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));

  const add = ({ product, variant }: Option) => {
    const base = mode === "purchase" ? (variant?.cost ?? product.cost) : (variant?.price ?? product.price);
    const existing = lines.find((l) => l.productId === product.id && l.variantId === (variant?.id ?? null));
    if (existing) return update(existing.key, { quantity: String((Number(existing.quantity) || 0) + 1) });
    onChange([
      ...lines,
      newLine({
        productId: product.id,
        variantId: variant?.id ?? null,
        name: variant ? `${product.name} · ${variant.value}` : product.name,
        price: base ? String(base) : "",
        taxRate: String(taxRates[taxRates.length - 1] ?? 0),
        serialized: Boolean(product.serialized),
      }),
    ]);
  };

  const rowClass = mode === "invoice" ? s.lineRowTax : mode === "quote" ? s.lineRow : s.lineRowNoDiscount;

  return (
    <div className={s.lines}>
      {lines.length > 0 && (
        <div className={`${rowClass} ${s.lineHeadRow}`}>
          <span className={s.lineHead}>Producto</span>
          <span className={s.lineHead}>Cantidad</span>
          <span className={s.lineHead}>{mode === "purchase" ? "Costo unit." : "Precio unit."}</span>
          {mode !== "purchase" && <span className={s.lineHead}>Descuento</span>}
          {mode === "invoice" && <span className={s.lineHead}>Impuesto</span>}
          <span className={s.lineHead} style={{ textAlign: "right" }}>
            Subtotal
          </span>
          <span />
        </div>
      )}

      {lines.map((l) => (
        <div key={l.key} className={rowClass}>
          {l.productId ? (
            <Input value={l.name} readOnly title={l.name} />
          ) : (
            <Input placeholder="Descripción del ítem" maxLength={160} value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} />
          )}
          <Input
            type="number"
            min="0.001"
            step="any"
            className="num"
            aria-label="Cantidad"
            value={l.quantity}
            onChange={(e) => update(l.key, { quantity: e.target.value })}
          />
          <Input
            type="number"
            min="0.01"
            step="0.01"
            className="num"
            aria-label="Precio"
            value={l.price}
            onChange={(e) => update(l.key, { price: e.target.value })}
          />
          {mode === "quote" && (
            <div className={s.discount}>
              <Select
                aria-label="Tipo de descuento"
                value={l.discountType}
                onChange={(e) => update(l.key, { discountType: e.target.value as Line["discountType"] })}
                options={[
                  { value: "AMOUNT", label: "$" },
                  { value: "PERCENT", label: "%" },
                ]}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                className="num"
                aria-label="Descuento"
                value={l.discountValue}
                onChange={(e) => update(l.key, { discountValue: e.target.value })}
              />
            </div>
          )}
          {mode === "invoice" && (
            <>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="num"
                aria-label="Descuento"
                value={l.discountValue}
                onChange={(e) => update(l.key, { discountValue: e.target.value })}
              />
              <Select
                aria-label="Impuesto"
                value={l.taxRate}
                onChange={(e) => update(l.key, { taxRate: e.target.value })}
                options={taxRates.map((r) => ({ value: String(r), label: `${r} %` }))}
              />
            </>
          )}
          <div className={`${s.lineTotal} num`}>{money(lineSubtotal(l, mode))}</div>
          <Button variant="ghost" aria-label="Quitar ítem" icon={<Trash2 size={14} />} onClick={() => remove(l.key)} />
        </div>
      ))}

      <div className="row wrap">
        <div className="grow" style={{ maxWidth: 420 }}>
          <Combobox<Option>
            placeholder="Buscar producto por nombre o código de barras"
            fetcher={searchProducts}
            onSelect={add}
            renderItem={({ product, variant }) => (
              <div className="row-between">
                <span>
                  {product.name}
                  {variant && <span className="muted"> · {variant.value}</span>}
                  {product.barcode && <span className="mono note"> {product.barcode}</span>}
                </span>
                <span className="num muted">
                  {money(mode === "purchase" ? (variant?.cost ?? product.cost) : (variant?.price ?? product.price))}
                </span>
              </div>
            )}
          />
        </div>
        {allowFree && (
          <Button icon={<Plus size={14} />} onClick={() => onChange([...lines, newLine({ taxRate: String(taxRates[taxRates.length - 1] ?? 0) })])}>
            Ítem libre
          </Button>
        )}
      </div>
    </div>
  );
}

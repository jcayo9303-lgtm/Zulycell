"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, History, Plus, ScanLine, SlidersHorizontal, Tags } from "lucide-react";
import { Alert, Badge, Button, Card, Empty, Kpi, Loading, PageHeader, Pager, SearchInput, Select, Toggle } from "@/components/ui";
import { ProductForm } from "@/components/inventory/ProductForm";
import { AdjustStockModal, KardexModal, SerialsModal } from "@/components/inventory/StockModals";
import { ImportModal } from "@/components/inventory/ImportModal";
import { CategoriesModal } from "@/components/inventory/CategoriesModal";
import { isLowStock, type Category, type Product } from "@/components/inventory/types";
import s from "@/components/inventory/inventory.module.css";
import { api, type Paginated } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/hooks";
import { fmtNumber, fmtPercent, fmtQty } from "@/lib/format";
import { useSession } from "@/lib/session";

type Summary = { count: number; inventoryValue: number; lowStock: number };
type Dialog =
  | { kind: "form"; product: Product | null }
  | { kind: "adjust"; product: Product }
  | { kind: "kardex"; product: Product }
  | { kind: "serials"; product: Product }
  | { kind: "import" }
  | { kind: "categories" }
  | null;

const PAGE_SIZE = 50;

export default function InventoryPage() {
  const { can, money } = useSession();
  const canEdit = can("inventory_edit");
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brand, setBrand] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const search = useDebounced(q, 250);

  const products = useFetch(
    () =>
      api.get<Paginated<Product>>("/products", {
        q: search,
        categoryId,
        brand,
        lowStock: lowStock || undefined,
        includeRecipes: false,
        page,
        pageSize: PAGE_SIZE,
      }),
    [search, categoryId, brand, lowStock, page],
  );
  const summary = useFetch(() => api.get<Summary>("/products/summary"), []);
  const categories = useFetch(() => api.get<Category[]>("/categories"), []);
  const brands = useFetch(() => api.get<string[]>("/products/brands"), []);

  const refresh = () => {
    void products.reload();
    void summary.reload();
    void categories.reload();
    void brands.reload();
  };
  const closeAndRefresh = () => {
    setDialog(null);
    refresh();
  };
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Inventario"
        subtitle="Productos, precios y stock del negocio"
        actions={
          canEdit && (
            <>
              <Button icon={<Tags size={14} />} onClick={() => setDialog({ kind: "categories" })}>
                Categorías
              </Button>
              <Button icon={<FileSpreadsheet size={14} />} onClick={() => setDialog({ kind: "import" })}>
                Importar desde Excel
              </Button>
              <Button icon={<Download size={14} />} onClick={() => (window.location.href = api.url("/products/export.xlsx"))}>
                Exportar Excel
              </Button>
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setDialog({ kind: "form", product: null })}>
                Crear producto
              </Button>
            </>
          )
        }
      />

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi label="Productos" value={summary.data ? fmtNumber(summary.data.count) : "—"} />
        <Kpi label="Valor del inventario (a costo)" value={summary.data ? money(summary.data.inventoryValue) : "—"} />
        <Kpi
          label="Con stock bajo"
          value={summary.data ? fmtNumber(summary.data.lowStock) : "—"}
          tone={summary.data?.lowStock ? "danger" : undefined}
          foot="En o por debajo de su alerta"
        />
      </div>

      <Card flush>
        <div className={s.filters}>
          <SearchInput
            placeholder="Buscar por nombre, código, marca, modelo o IMEI"
            value={q}
            onChange={(e) => resetPage(setQ)(e.target.value)}
          />
          <Select
            className={s.filterSelect}
            value={brand}
            onChange={(e) => resetPage(setBrand)(e.target.value)}
            placeholder="Todas las marcas"
            options={(brands.data ?? []).map((b) => ({ value: b, label: b }))}
          />
          <Select
            className={s.filterSelect}
            value={categoryId}
            onChange={(e) => resetPage(setCategoryId)(e.target.value)}
            placeholder="Todas las categorías"
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <Toggle checked={lowStock} onChange={resetPage(setLowStock)} label="Solo stock bajo" />
        </div>

        {products.error ? (
          <div style={{ padding: 16 }}>
            <Alert>{products.error}</Alert>
          </div>
        ) : products.loading && !products.data ? (
          <Loading />
        ) : !products.data?.items.length ? (
          <Empty
            title={q || categoryId || brand || lowStock ? "Sin resultados" : "Aún no tienes productos"}
            action={
              canEdit &&
              !q && (
                <Button variant="primary" icon={<Plus size={14} />} onClick={() => setDialog({ kind: "form", product: null })}>
                  Crear producto
                </Button>
              )
            }
          >
            {q || categoryId || brand || lowStock ? "Prueba con otro filtro." : "Crea tu primer producto o impórtalos desde Excel."}
          </Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }} />
                    <th>Producto</th>
                    <th>Marca</th>
                    <th>Compatible con</th>
                    <th>Código</th>
                    <th>Categoría</th>
                    <th className="num">Precio</th>
                    <th className="num">Costo</th>
                    <th className="num">Margen</th>
                    <th className="num">Stock</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {products.data.items.map((p) => (
                    <tr
                      key={p.id}
                      className={canEdit ? "clickable" : undefined}
                      onClick={() => canEdit && setDialog({ kind: "form", product: p })}
                    >
                      <td>
                        <div className={s.thumb} style={p.imageUrl ? { backgroundImage: `url("${p.imageUrl}")` } : undefined} />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          {p.name}
                          {p.serialized && <Badge tone="info">IMEI</Badge>}
                        </div>
                        {(p.variants.length > 0 || p.warrantyDays > 0) && (
                          <div className="note">
                            {[p.variants.length > 0 && `${p.variants.length} variantes`, p.warrantyDays > 0 && `Garantía ${p.warrantyDays} días`]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="muted">{p.brand ?? "—"}</td>
                      <td className="muted">{p.compatibleWith ?? "—"}</td>
                      <td>{p.barcode ? <span className="mono">{p.barcode}</span> : <span className="note">—</span>}</td>
                      <td className="muted">{p.categoryName ?? "—"}</td>
                      <td className="num">{money(p.price)}</td>
                      <td className="num muted">{money(p.cost)}</td>
                      <td className="num">{fmtPercent(p.margin)}</td>
                      <td className="num">
                        {!p.trackStock ? (
                          <span className="note">No controla</span>
                        ) : isLowStock(p) ? (
                          <Badge tone="danger">{fmtQty(p.stock, p.unit)}</Badge>
                        ) : (
                          fmtQty(p.stock, p.unit)
                        )}
                      </td>
                      <td className="num" onClick={(e) => e.stopPropagation()}>
                        <div className="row" style={{ justifyContent: "flex-end", gap: 2 }}>
                          {canEdit && p.trackStock && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Ajustar stock"
                              aria-label="Ajustar stock"
                              icon={<SlidersHorizontal size={14} />}
                              onClick={() => setDialog({ kind: "adjust", product: p })}
                            />
                          )}
                          {p.serialized && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="IMEI"
                              aria-label="IMEI"
                              icon={<ScanLine size={14} />}
                              onClick={() => setDialog({ kind: "serials", product: p })}
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Movimientos"
                            aria-label="Movimientos"
                            icon={<History size={14} />}
                            onClick={() => setDialog({ kind: "kardex", product: p })}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} total={products.data.total} onPage={setPage} />
          </>
        )}
      </Card>

      {dialog?.kind === "form" && (
        <ProductForm
          product={dialog.product}
          categories={categories.data ?? []}
          brands={brands.data ?? []}
          onClose={() => setDialog(null)}
          onSaved={closeAndRefresh}
        />
      )}
      {dialog?.kind === "adjust" && <AdjustStockModal product={dialog.product} onClose={() => setDialog(null)} onSaved={closeAndRefresh} />}
      {dialog?.kind === "kardex" && <KardexModal product={dialog.product} onClose={() => setDialog(null)} />}
      {dialog?.kind === "serials" && <SerialsModal product={dialog.product} onClose={() => setDialog(null)} />}
      {dialog?.kind === "import" && <ImportModal onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.kind === "categories" && (
        <CategoriesModal categories={categories.data ?? []} onClose={() => setDialog(null)} onChanged={refresh} />
      )}
    </>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Alert, Button, Combobox, Field, ImageUpload, Input, Modal, Select, Textarea, Toggle, useConfirm, useToast } from "@/components/ui";
import { api, ApiError, type Paginated } from "@/lib/api";
import { fmtPercent, fmtQty } from "@/lib/format";
import { UNITS, type Unit } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { compatibleUnits, convertUnit, numOrNull, type Category, type Product } from "./types";
import s from "./inventory.module.css";

export type Recipe = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  description: string | null;
  visibleInCatalog: boolean;
  price: number;
  cost: number;
  margin: number | null;
  ingredients: {
    ingredientId: string;
    name: string;
    quantity: number;
    unit: Unit;
    ingredientUnit: Unit;
    ingredientCost: number;
    lineCost: number;
    deleted: boolean;
  }[];
};

type Row = { ingredientId: string; name: string; quantity: string; unit: Unit; ingredientUnit: Unit; ingredientCost: number };

export function RecipeForm({
  recipe,
  categories,
  onClose,
  onSaved,
}: {
  recipe: Recipe | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { money } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(recipe?.name ?? "");
  const [categoryId, setCategoryId] = useState(recipe?.categoryId ?? "");
  const [price, setPrice] = useState(recipe ? String(recipe.price) : "");
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [image, setImage] = useState<{ key: string | null; url: string | null }>({ key: recipe?.imageKey ?? null, url: recipe?.imageUrl ?? null });
  const [visible, setVisible] = useState(recipe?.visibleInCatalog ?? true);
  const [rows, setRows] = useState<Row[]>(
    recipe?.ingredients.map((i) => ({
      ingredientId: i.ingredientId,
      name: i.name,
      quantity: String(i.quantity),
      unit: i.unit,
      ingredientUnit: i.ingredientUnit,
      ingredientCost: i.ingredientCost,
    })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const lineCost = (r: Row) => convertUnit(numOrNull(r.quantity) ?? 0, r.unit, r.ingredientUnit) * r.ingredientCost;
  const cost = rows.reduce((acc, r) => acc + lineCost(r), 0);
  const priceNum = numOrNull(price);
  const margin = priceNum && cost > 0 ? ((priceNum - cost) / cost) * 100 : null;

  const setRow = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    const body = {
      name,
      categoryId: categoryId || null,
      price: priceNum,
      description,
      imageKey: image.key,
      visibleInCatalog: visible,
      ingredients: rows.map((r) => ({ ingredientId: r.ingredientId, quantity: numOrNull(r.quantity), unit: r.unit })),
    };
    try {
      if (recipe) await api.put(`/recipes/${recipe.id}`, body);
      else await api.post("/recipes", body);
      toast(recipe ? "Receta actualizada" : "Receta creada");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la receta");
      if (err instanceof ApiError) setFields(err.fields ?? {});
      setBusy(false);
    }
  }

  async function remove() {
    if (!recipe || !confirm(`¿Eliminar la receta "${recipe.name}"?`)) return;
    await api.del(`/recipes/${recipe.id}`);
    toast("Receta eliminada");
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={720}
      title={recipe ? "Editar receta" : "Crear receta"}
      footer={
        <>
          {recipe && (
            <Button variant="danger" onClick={remove} style={{ marginRight: "auto" }}>
              Eliminar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="recipe-form" loading={busy}>
            Guardar receta
          </Button>
        </>
      }
    >
      <form id="recipe-form" className="stack" onSubmit={submit}>
        <div className="grid-2">
          <Field label="Nombre de la receta / plato" required error={fields.name}>
            <Input autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Categoría">
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder="Sin categoría"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <h3 className="section-title">Ingredientes</h3>
          <Combobox<Product>
            placeholder="Buscar insumo del inventario…"
            fetcher={async (q) =>
              (await api.get<Paginated<Product>>("/products", { q, includeRecipes: false, pageSize: 10 })).items.filter(
                (p) => !rows.some((r) => r.ingredientId === p.id),
              )
            }
            renderItem={(p) => (
              <div className="row-between">
                <span>{p.name}</span>
                <span className="note">
                  {money(p.cost)} / {fmtQty(1, p.unit)}
                </span>
              </div>
            )}
            onSelect={(p) =>
              setRows((prev) => [
                ...prev,
                { ingredientId: p.id, name: p.name, quantity: "", unit: p.unit, ingredientUnit: p.unit, ingredientCost: p.cost },
              ])
            }
          />
          {fields.ingredients && <span className="text-danger note">{fields.ingredients}</span>}
          {rows.length > 0 && (
            <div className="table-wrap">
              <table className={`table ${s.variantTable}`}>
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th className="num">Cantidad por porción</th>
                    <th>Unidad</th>
                    <th className="num">Costo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.ingredientId}>
                      <td>{r.name}</td>
                      <td>
                        <Input
                          type="number"
                          min={0.001}
                          step="0.001"
                          className="num"
                          value={r.quantity}
                          invalid={Boolean(fields[`ingredients.${i}.quantity`])}
                          onChange={(e) => setRow(i, { quantity: e.target.value })}
                        />
                      </td>
                      <td>
                        <Select
                          value={r.unit}
                          onChange={(e) => setRow(i, { unit: e.target.value as Unit })}
                          options={compatibleUnits(r.ingredientUnit).map((u) => ({ value: u, label: UNITS[u] }))}
                        />
                      </td>
                      <td className="num">{money(lineCost(r))}</td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Quitar"
                          icon={<Trash2 size={14} />}
                          onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid-3">
          <Field label="Costo total de la receta" hint="Σ cantidad × costo del insumo">
            <Input value={money(cost)} readOnly disabled className="num" />
          </Field>
          <Field label="Precio de venta del plato" required error={fields.price}>
            <Input type="number" min={0.01} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Margen de ganancia">
            <Input value={fmtPercent(margin)} readOnly disabled />
          </Field>
        </div>

        <Field label="Foto del plato">
          <ImageUpload folder="products" url={image.url} onChange={(img) => setImage({ key: img?.key ?? null, url: img?.url ?? null })} />
        </Field>
        <Field label="Notas / descripción" hint={`${description.length}/500`}>
          <Textarea maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Toggle checked={visible} onChange={setVisible} label="Mostrar en el catálogo virtual" />
        <p className="note">Al vender este plato se descuentan automáticamente los insumos del inventario.</p>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

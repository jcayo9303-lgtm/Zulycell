"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Alert, Badge, Button, Card, Empty, Loading, PageHeader } from "@/components/ui";
import { RecipeForm, type Recipe } from "@/components/inventory/RecipeForm";
import type { Category } from "@/components/inventory/types";
import s from "@/components/inventory/inventory.module.css";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtPercent } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function RecipesPage() {
  const { money } = useSession();
  const recipes = useFetch(() => api.get<Recipe[]>("/recipes"), []);
  const categories = useFetch(() => api.get<Category[]>("/categories"), []);
  const [editing, setEditing] = useState<Recipe | null | undefined>(undefined);

  return (
    <>
      <PageHeader
        title={
          <span className="row">
            Recetas
          </span>
        }
        subtitle="Platos y productos compuestos por insumos del inventario"
        actions={
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing(null)}>
            Crear receta
          </Button>
        }
      />

      <Card flush>
        {recipes.error ? (
          <div style={{ padding: 16 }}>
            <Alert>{recipes.error}</Alert>
          </div>
        ) : recipes.loading && !recipes.data ? (
          <Loading />
        ) : !recipes.data?.length ? (
          <Empty title="Aún no tienes recetas">Define los insumos de cada plato y su costo se calcula solo.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 44 }} />
                  <th>Receta</th>
                  <th>Categoría</th>
                  <th className="num">Ingredientes</th>
                  <th className="num">Costo</th>
                  <th className="num">Precio</th>
                  <th className="num">Margen</th>
                </tr>
              </thead>
              <tbody>
                {recipes.data.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => setEditing(r)}>
                    <td>
                      <div className={s.thumb} style={r.imageUrl ? { backgroundImage: `url("${r.imageUrl}")` } : undefined} />
                    </td>
                    <td>
                      {r.name}
                      {r.ingredients.some((i) => i.deleted) && (
                        <span style={{ marginLeft: 6 }}>
                          <Badge tone="warning">Insumo eliminado</Badge>
                        </span>
                      )}
                    </td>
                    <td className="muted">{r.categoryName ?? "—"}</td>
                    <td className="num">{r.ingredients.length}</td>
                    <td className="num muted">{money(r.cost)}</td>
                    <td className="num">{money(r.price)}</td>
                    <td className={`num ${r.margin !== null && r.margin < 0 ? "text-danger" : ""}`}>{fmtPercent(r.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing !== undefined && (
        <RecipeForm
          recipe={editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void recipes.reload();
          }}
        />
      )}
    </>
  );
}

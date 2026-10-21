"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Alert, Button, Empty, Input, Modal, useConfirm } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Category } from "./types";

export function CategoriesModal({
  categories,
  onClose,
  onChanged,
}: {
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  }

  return (
    <Modal open onClose={onClose} title="Categorías" width={460}>
      <div className="stack">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void run(async () => (await api.post("/categories", { name }), setName("")));
          }}
        >
          <Input className="grow" placeholder="Nueva categoría" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Agregar
          </Button>
        </form>
        {error && <Alert>{error}</Alert>}
        {!categories.length ? (
          <Empty title="Aún no hay categorías" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th className="num">Productos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>
                    {editing?.id === c.id ? (
                      <form
                        className="row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => (await api.put(`/categories/${c.id}`, { name: editing.name }), setEditing(null)));
                        }}
                      >
                        <Input autoFocus maxLength={60} value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} />
                        <Button size="sm" type="submit">
                          Guardar
                        </Button>
                      </form>
                    ) : (
                      c.name
                    )}
                  </td>
                  <td className="num">{c.productCount}</td>
                  <td className="num">
                    <Button variant="ghost" size="sm" aria-label="Renombrar" icon={<Pencil size={13} />} onClick={() => setEditing({ id: c.id, name: c.name })} />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Eliminar"
                      icon={<Trash2 size={13} />}
                      onClick={() =>
                        confirm(`¿Eliminar la categoría "${c.name}"? Sus productos quedarán sin categoría.`) &&
                        void run(() => api.del(`/categories/${c.id}`))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

"use client";

import { useState, type KeyboardEvent } from "react";
import { Alert, Button, Empty, Input, Loading, Modal, SearchInput } from "@/components/ui";
import type { Product, Variant } from "@/components/sales/types";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import s from "./pos.module.css";

type SerialRow = { id: string; serial: string; variantId: string | null };

/** Selector de IMEI disponibles para vender un producto controlado por número de serie */
export function SerialPicker({
  product,
  variant,
  taken,
  onClose,
  onConfirm,
}: {
  product: Product;
  variant: Variant | null;
  /** IMEI que ya están en el carrito */
  taken: string[];
  onClose: () => void;
  onConfirm: (serials: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data, loading, error: loadError } = useFetch(
    () => api.get<SerialRow[]>(`/products/${product.id}/serials`, { status: "IN_STOCK", variantId: variant?.id }),
    [product.id, variant?.id],
  );

  const available = (data ?? []).filter((r) => !taken.includes(r.serial));
  const visible = q ? available.filter((r) => r.serial.includes(q.replace(/\s+/g, "").toUpperCase())) : available;
  const toggle = (serial: string) => setPicked((p) => (p.includes(serial) ? p.filter((x) => x !== serial) : [...p, serial]));

  // IMEI escrito o escaneado con lector: se marca si está disponible
  const onTypedKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const serial = typed.replace(/\s+/g, "").toUpperCase();
    if (!serial) return;
    if (taken.includes(serial)) setError(`El IMEI ${serial} ya está en el carrito.`);
    else if (!available.some((r) => r.serial === serial)) setError(`El IMEI ${serial} no está disponible para este producto.`);
    else {
      setError(null);
      setPicked((p) => (p.includes(serial) ? p : [...p, serial]));
    }
    setTyped("");
  };

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={`Elige el IMEI · ${variant ? `${product.name} · ${variant.value}` : product.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!picked.length} onClick={() => onConfirm(picked)}>
            Agregar {picked.length || ""} al carrito
          </Button>
        </>
      }
    >
      <div className="stack">
        <Input
          autoFocus
          className="mono"
          placeholder="Escanea o escribe el IMEI y presiona Enter"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={onTypedKey}
        />
        {error && <Alert>{error}</Alert>}
        {available.length > 8 && <SearchInput placeholder="Filtrar IMEI" value={q} onChange={(e) => setQ(e.target.value)} />}
        {loading ? (
          <Loading />
        ) : loadError ? (
          <Alert>{loadError}</Alert>
        ) : !available.length ? (
          <Empty title="Sin unidades disponibles">No hay IMEI en stock para este producto.</Empty>
        ) : (
          <div className={s.serialList}>
            {visible.map((r) => (
              <label key={r.id} className={s.serialItem}>
                <input type="checkbox" checked={picked.includes(r.serial)} onChange={() => toggle(r.serial)} />
                <span className="mono">{r.serial}</span>
              </label>
            ))}
          </div>
        )}
        <span className="note">
          {picked.length} seleccionado{picked.length === 1 ? "" : "s"} de {available.length} disponible{available.length === 1 ? "" : "s"}
        </span>
      </div>
    </Modal>
  );
}

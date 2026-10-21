"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Alert, Button, Modal } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type ImportResult = { created: number; updated: number; errors: { row: number; message: string }[] };

/** Carga masiva desde Excel (docs §5): columnas A-I de la plantilla */
export function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api.post<ImportResult>("/products/import", form);
      setResult(r);
      if (r.created || r.updated) onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo importar el archivo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Importar productos desde Excel"
      width={560}
      footer={
        <>
          <Button onClick={onClose}>{result ? "Cerrar" : "Cancelar"}</Button>
          {!result && (
            <Button variant="primary" onClick={submit} loading={busy} disabled={!file}>
              Importar
            </Button>
          )}
        </>
      }
    >
      <div className="stack">
        <p className="muted">
          Descarga la plantilla, completa una fila por producto y súbela en formato <code>.xlsx</code> o <code>.csv</code>.
          Columnas: Nombre*, Código de barras, Precio de costo, Precio de venta*, Categoría, Cantidad, Marca, Compatible con,
          Garantía días. Si el código de barras (o
          el nombre) ya existe, el producto se actualiza.
        </p>
        <div className="row wrap">
          <Button icon={<Download size={14} />} onClick={() => (window.location.href = api.url("/products/import/template"))}>
            Descargar plantilla Excel
          </Button>
          <Button icon={<Upload size={14} />} onClick={() => inputRef.current?.click()}>
            Subir archivo
          </Button>
          {file && <code className="note">{file.name}</code>}
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              e.target.value = "";
            }}
          />
        </div>
        {error && <Alert>{error}</Alert>}
        {result && (
          <>
            <Alert tone="info">
              {result.created} productos creados · {result.updated} actualizados · {result.errors.length} filas con error
            </Alert>
            {result.errors.length > 0 && (
              <div className="table-wrap" style={{ maxHeight: 240, overflowY: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="num">Fila</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e) => (
                      <tr key={e.row}>
                        <td className="num">{e.row}</td>
                        <td className="text-danger">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

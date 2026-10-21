"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, PackagePlus, Plus } from "lucide-react";
import { Button, Card, Empty, Kpi, Loading, PageHeader, Pager, SearchInput, useToast } from "@/components/ui";
import { ContactFormModal } from "@/components/contacts/ContactForm";
import type { SupplierRow } from "@/components/contacts/types";
import { api, type Paginated } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { PurchaseModal } from "./PurchaseModal";

type SupplierList = Paginated<SupplierRow> & { stats: { count: number; totalPayable: number } };

export default function SuppliersPage() {
  const router = useRouter();
  const toast = useToast();
  const { money } = useSession();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"create" | "purchase" | null>(null);
  const query = useDebounced(q);

  const { data, loading, reload } = useFetch(
    () => api.get<SupplierList>("/suppliers", { q: query, page, pageSize: 50 }),
    [query, page],
  );

  return (
    <>
      <PageHeader
        title="Proveedores"
        subtitle="Compras, cuentas por pagar y contactos de tus proveedores"
        actions={
          <>
            <Button icon={<Download size={14} />} onClick={() => (window.location.href = api.url("/suppliers/export.xlsx"))}>
              Exportar Excel
            </Button>
            <Button icon={<PackagePlus size={14} />} onClick={() => setModal("purchase")}>
              Registrar compra
            </Button>
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setModal("create")}>
              Crear proveedor
            </Button>
          </>
        }
      />

      <div className="stack">
        <div className="kpi-grid">
          <Kpi label="Total de proveedores" value={data?.stats.count ?? "—"} />
          <Kpi
            label="Total por pagar"
            value={data ? money(data.stats.totalPayable) : "—"}
            tone={data && data.stats.totalPayable > 0 ? "danger" : undefined}
          />
        </div>

        <Card
          flush
          title={
            <div className="grow" style={{ maxWidth: 360 }}>
              <SearchInput
                placeholder="Buscar un proveedor"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          }
        >
          {loading && !data ? (
            <Loading />
          ) : !data?.items.length ? (
            <Empty title={q ? "Sin resultados" : "Aún no tienes proveedores"}>
              {q ? "Prueba con otro nombre." : "Registra tus proveedores para controlar compras y deudas."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Celular</th>
                    <th>Documento</th>
                    <th className="num">Total por pagar</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((x) => (
                    <tr key={x.id} className="clickable" onClick={() => router.push(`/proveedores/${x.id}`)}>
                      <td>{x.name}</td>
                      <td className="muted">{x.phone ?? "—"}</td>
                      <td className="mono muted">{x.document ?? "—"}</td>
                      <td className={`num ${x.balance > 0 ? "text-danger" : ""}`}>{money(x.balance)}</td>
                      <td className="num">
                        <Button size="sm" variant="ghost">
                          Detalle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
        </Card>
      </div>

      <ContactFormModal<SupplierRow>
        open={modal === "create"}
        onClose={() => setModal(null)}
        endpoint="/suppliers"
        title="Crear proveedor"
        withNotes
        onSaved={(x) => {
          setModal(null);
          router.push(`/proveedores/${x.id}`);
        }}
      />
      <PurchaseModal
        open={modal === "purchase"}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null);
          toast("Compra registrada y stock actualizado");
          void reload();
        }}
      />
    </>
  );
}

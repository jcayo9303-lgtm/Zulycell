"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { Button, Card, Empty, Kpi, Loading, PageHeader, Pager, SearchInput, Toggle } from "@/components/ui";
import { ContactFormModal } from "@/components/contacts/ContactForm";
import type { ClientRow } from "@/components/contacts/types";
import { api, type Paginated } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/hooks";
import { useSession } from "@/lib/session";

type ClientList = Paginated<ClientRow> & { stats: { count: number; totalReceivable: number } };

export default function ClientsPage() {
  const router = useRouter();
  const { money, can } = useSession();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [withDebt, setWithDebt] = useState(false);
  const [creating, setCreating] = useState(false);
  const query = useDebounced(q);

  const { data, loading, reload } = useFetch(
    () => api.get<ClientList>("/clients", { q: query, page, pageSize: 50, withDebt: withDebt || undefined }),
    [query, page, withDebt],
  );

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Historial de compras, ventas a crédito y cobranza"
        actions={
          <>
            <Button icon={<Download size={14} />} onClick={() => (window.location.href = api.url("/clients/export.xlsx"))}>
              Exportar Excel
            </Button>
            {can("clients_edit") && (
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
                Crear cliente
              </Button>
            )}
          </>
        }
      />

      <div className="stack">
        <div className="kpi-grid">
          <Kpi label="Total de clientes" value={data?.stats.count ?? "—"} />
          <Kpi
            label="Total por cobrar"
            value={data ? money(data.stats.totalReceivable) : "—"}
            tone={data && data.stats.totalReceivable > 0 ? "danger" : undefined}
          />
        </div>

        <Card
          flush
          title={
            <div className="row wrap grow">
              <div className="grow" style={{ maxWidth: 360 }}>
                <SearchInput
                  placeholder="Buscar cliente por nombre, celular o documento"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Toggle checked={withDebt} onChange={(v) => (setWithDebt(v), setPage(1))} label="Solo con deuda" />
            </div>
          }
        >
          {loading && !data ? (
            <Loading />
          ) : !data?.items.length ? (
            <Empty title={q ? "Sin resultados" : "Aún no tienes clientes"}>
              {q ? "Prueba con otro nombre o número." : "Registra a tus clientes para llevar su historial y sus fiados."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Celular</th>
                    <th>Documento</th>
                    <th className="num">Total por cobrar</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => router.push(`/clientes/${c.id}`)}>
                      <td>{c.name}</td>
                      <td className="muted">{c.phone ?? "—"}</td>
                      <td className="mono muted">{c.document ?? "—"}</td>
                      <td className={`num ${c.balance > 0 ? "text-danger" : "text-success"}`}>{money(c.balance)}</td>
                      <td className="num">
                        <Button size="sm" variant="ghost">
                          Ver detalle
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

      <ContactFormModal<ClientRow>
        open={creating}
        onClose={() => setCreating(false)}
        endpoint="/clients"
        title="Crear cliente"
        onSaved={(c) => {
          setCreating(false);
          void reload();
          router.push(`/clientes/${c.id}`);
        }}
      />
    </>
  );
}

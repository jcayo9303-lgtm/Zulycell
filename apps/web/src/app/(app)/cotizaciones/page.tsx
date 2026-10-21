"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge, Button, Card, Empty, Loading, PageHeader, Pager, SearchInput } from "@/components/ui";
import { docDate } from "@/components/contacts/PrintDocument";
import { api, type Paginated } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/hooks";
import { fmtSeq } from "@/lib/format";
import { useSession } from "@/lib/session";

type Row = {
  id: string;
  number: number;
  clientName: string | null;
  date: string;
  validUntil: string | null;
  total: number;
  status: "DRAFT" | "CONVERTED";
};

export default function QuotesPage() {
  const router = useRouter();
  const { money } = useSession();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = useDebounced(q);
  const { data, loading } = useFetch(() => api.get<Paginated<Row>>("/quotes", { q: query, page, pageSize: 50 }), [query, page]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title={
          <span className="row">
            Cotizaciones
          </span>
        }
        subtitle="Presupuestos formales que puedes compartir y convertir en venta"
        actions={
          <Link href="/cotizaciones/nueva">
            <Button variant="primary" icon={<Plus size={14} />}>
              Nueva cotización
            </Button>
          </Link>
        }
      />
      <Card
        flush
        title={
          <div className="grow" style={{ maxWidth: 360 }}>
            <SearchInput placeholder="Buscar por cliente o número" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
          </div>
        }
      >
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty title="Sin cotizaciones">Crea una cotización y compártela por WhatsApp o PDF.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>N.º</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Vigencia</th>
                  <th>Estado</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => {
                  const expired = r.status === "DRAFT" && r.validUntil && r.validUntil.slice(0, 10) < today;
                  return (
                    <tr key={r.id} className="clickable" onClick={() => router.push(`/cotizaciones/${r.id}`)}>
                      <td className="mono">{fmtSeq(r.number)}</td>
                      <td>{r.clientName ?? <span className="muted">Sin cliente</span>}</td>
                      <td className="muted">{docDate(r.date)}</td>
                      <td className="muted">{r.validUntil ? docDate(r.validUntil) : "—"}</td>
                      <td>
                        {r.status === "CONVERTED" ? (
                          <Badge tone="success">Convertida en venta</Badge>
                        ) : expired ? (
                          <Badge tone="warning">Vencida</Badge>
                        ) : (
                          <Badge tone="info">Vigente</Badge>
                        )}
                      </td>
                      <td className="num">{money(r.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>
    </>
  );
}

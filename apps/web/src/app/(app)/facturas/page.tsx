"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Alert, Badge, Button, Card, Empty, Loading, PageHeader, Pager, SearchInput } from "@/components/ui";
import { docDate } from "@/components/contacts/PrintDocument";
import { api, type Paginated } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/hooks";
import { fmtSeq } from "@/lib/format";
import { INVOICE_STATUS, INVOICE_TYPES } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { STATUS_TONE, type Invoice } from "./types";

type Row = Omit<Invoice, "items" | "business">;

export default function InvoicesPage() {
  const router = useRouter();
  const { money } = useSession();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = useDebounced(q);
  const { data, loading } = useFetch(() => api.get<Paginated<Row>>("/invoices", { q: query, page, pageSize: 50 }), [query, page]);

  return (
    <>
      <PageHeader
        title={
          <span className="row">
            Factura electrónica
          </span>
        }
        subtitle="Facturas de venta, notas crédito y notas débito"
        actions={
          <Link href="/facturas/nueva">
            <Button variant="primary" icon={<Plus size={14} />}>
              Nueva factura
            </Button>
          </Link>
        }
      />
      <div className="stack">
        <Alert tone="info">
          La emisión está en modo simulado: los documentos reciben un código de prueba (SIM-…). Para que tengan validez legal hay que
          integrar el proveedor tecnológico autorizado por la autoridad tributaria de tu país.
        </Alert>
        <Card
          flush
          title={
            <div className="grow" style={{ maxWidth: 360 }}>
              <SearchInput placeholder="Buscar por receptor, NIT o número" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
            </div>
          }
        >
          {loading && !data ? (
            <Loading />
          ) : !data?.items.length ? (
            <Empty title="Sin facturas">Crea tu primera factura electrónica.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>N.º</th>
                    <th>Tipo</th>
                    <th>Receptor</th>
                    <th>NIT</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => router.push(`/facturas/${r.id}`)}>
                      <td className="mono">{fmtSeq(r.number)}</td>
                      <td>{INVOICE_TYPES[r.type]}</td>
                      <td>{r.receiverName}</td>
                      <td className="mono muted">{r.receiverTaxId}</td>
                      <td className="muted">{docDate(r.issueDate)}</td>
                      <td>
                        <Badge tone={STATUS_TONE[r.status]}>{INVOICE_STATUS[r.status]}</Badge>
                      </td>
                      <td className="num">{money(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
        </Card>
      </div>
    </>
  );
}

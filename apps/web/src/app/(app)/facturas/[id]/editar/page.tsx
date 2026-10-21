"use client";

import { useParams } from "next/navigation";
import { Alert, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtSeq } from "@/lib/format";
import { InvoiceEditor } from "../../InvoiceEditor";
import type { Invoice } from "../../types";

export default function EditInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useFetch(() => api.get<Invoice>(`/invoices/${id}`), [id]);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;
  if (data.status !== "DRAFT") return <Alert>Solo se pueden editar facturas en borrador.</Alert>;
  return (
    <>
      <PageHeader title={<>Editar factura <span className="mono">{fmtSeq(data.number)}</span></>} />
      <InvoiceEditor invoice={data} />
    </>
  );
}

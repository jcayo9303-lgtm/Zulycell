"use client";

import { useParams } from "next/navigation";
import { Alert, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtSeq } from "@/lib/format";
import { QuoteEditor } from "../../QuoteEditor";
import type { Quote } from "../../types";

export default function EditQuotePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useFetch(() => api.get<Quote>(`/quotes/${id}`), [id]);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;
  if (data.status === "CONVERTED") return <Alert>Esta cotización ya se convirtió en venta y no se puede editar.</Alert>;
  return (
    <>
      <PageHeader title={<>Editar cotización <span className="mono">{fmtSeq(data.number)}</span></>} />
      <QuoteEditor quote={data} />
    </>
  );
}

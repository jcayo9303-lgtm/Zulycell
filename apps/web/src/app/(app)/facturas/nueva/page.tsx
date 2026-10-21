"use client";

import { PageHeader } from "@/components/ui";
import { InvoiceEditor } from "../InvoiceEditor";

export default function NewInvoicePage() {
  return (
    <>
      <PageHeader title="Nueva factura" subtitle="Se guarda como borrador; luego puedes previsualizarla y emitirla." />
      <InvoiceEditor />
    </>
  );
}

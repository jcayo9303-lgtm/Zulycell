"use client";

import { PageHeader } from "@/components/ui";
import { QuoteEditor } from "../QuoteEditor";

export default function NewQuotePage() {
  return (
    <>
      <PageHeader title="Nueva cotización" />
      <QuoteEditor />
    </>
  );
}

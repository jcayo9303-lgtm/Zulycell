import type { DocBusiness } from "@/components/contacts/types";
import type { PaymentMethod } from "@/lib/labels";

export type InvoiceItem = {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
  subtotal: number;
  tax: number;
};

export type Invoice = {
  id: string;
  number: number | null;
  type: "SALE" | "CREDIT_NOTE" | "DEBIT_NOTE";
  status: "DRAFT" | "ISSUED" | "VOIDED";
  clientId: string;
  receiverName: string;
  receiverTaxId: string;
  receiverAddress: string;
  receiverEmail: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  method: PaymentMethod;
  issueDate: string;
  notes: string | null;
  relatedInvoiceId: string | null;
  providerRef: string | null;
  items: InvoiceItem[];
  related?: { id: string; number: number | null; type: string } | null;
  business: DocBusiness;
};

export const STATUS_TONE = { DRAFT: "info", ISSUED: "success", VOIDED: "danger" } as const;

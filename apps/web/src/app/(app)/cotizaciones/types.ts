import type { DocBusiness } from "@/components/contacts/types";

export type QuoteItem = {
  id: string;
  productId: string | null;
  variantId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  discountType: "AMOUNT" | "PERCENT" | null;
  discountValue: number;
  subtotal: number;
};

export type Quote = {
  id: string;
  number: number;
  clientId: string | null;
  clientName: string | null;
  client: { id: string; name: string; phone: string | null; document: string | null; email: string | null; address: string | null } | null;
  date: string;
  validUntil: string | null;
  subtotal: number;
  discountType: "AMOUNT" | "PERCENT" | null;
  discountValue: number;
  discountTotal: number;
  total: number;
  notes: string | null;
  status: "DRAFT" | "CONVERTED";
  saleId: string | null;
  items: QuoteItem[];
  business: DocBusiness;
};

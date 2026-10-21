export type ProductOption = {
  id: string;
  name: string;
  barcode: string | null;
  price: number;
  cost: number;
  stock: number;
  unit: string;
  variants: { id: string; type: string; value: string; price: number | null; cost: number | null; stock: number }[];
  serialized?: boolean;
};

export type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  document: string | null;
  address: string | null;
  email: string | null;
  balance: number;
  createdAt: string;
};

export type SupplierRow = ClientRow & { notes: string | null };

export type Movement = {
  id: string;
  type: "DEBT" | "PAYMENT";
  amount: number;
  method: string | null;
  description: string | null;
  createdAt: string;
};

export type DocBusiness = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  currency: string;
  currencySymbol: string;
  logoUrl: string | null;
  taxAuthority?: string;
};

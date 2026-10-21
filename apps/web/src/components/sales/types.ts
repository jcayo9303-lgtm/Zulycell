import type { PaymentMethod, Unit } from "@/lib/labels";

export type Variant = {
  id: string;
  type: string;
  value: string;
  price: number | null;
  cost: number | null;
  stock: number;
  barcode: string | null;
};

export type Product = {
  id: string;
  name: string;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  imageUrl: string | null;
  price: number;
  cost: number;
  stock: number;
  lowStockAlert: number;
  unit: Unit;
  trackStock: boolean;
  isRecipe: boolean;
  variants: Variant[];
  brand?: string | null;
  compatibleWith?: string | null;
  warrantyDays?: number;
  /** Se vende eligiendo IMEI / número de serie */
  serialized?: boolean;
};

export type ClientLite = { id: string; name: string; phone: string | null; document?: string | null; balance?: number };

export type SaleRow = {
  id: string;
  number: number;
  total: number;
  method: PaymentMethod;
  status: "COMPLETED" | "VOIDED";
  createdAt: string;
  client: { id: string; name: string } | null;
  seller?: string | null;
  _count: { items: number };
};

export type SalesPage = {
  items: SaleRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: { total: number; count: number; avgTicket: number; profit: number };
};

export type IncomeRow = {
  key: string;
  sales: number;
  repairs: number;
  clientPayments: number;
  income: number;
  expenses: number;
  purchases: number;
  supplierPayments: number;
  outflow: number;
  net: number;
};

export type IncomeData = {
  from: string;
  to: string;
  group: "day" | "month";
  rows: IncomeRow[];
  totals: Omit<IncomeRow, "key">;
};

type MethodGroup = { byMethod: { method: PaymentMethod | null; total: number; count: number }[]; total: number };

export type CashSummary = {
  from: string;
  to: string;
  openingAmount: number;
  sales: MethodGroup & { count: number };
  repairs: MethodGroup;
  clientPayments: MethodGroup;
  expenses: MethodGroup;
  purchases: MethodGroup;
  supplierPayments: MethodGroup;
  movements: { in: number; out: number };
  cashIn: number;
  cashOut: number;
  expectedCash: number;
};

export type CashMovement = {
  id: string;
  type: "IN" | "OUT";
  amount: number;
  reason: string;
  userName: string | null;
  createdAt: string;
};

export type CashSession = {
  id: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  notes: string | null;
  openedByName: string | null;
  closedByName: string | null;
  movements: CashMovement[];
  summary: CashSummary;
};

export type CashSessionRow = Omit<CashSession, "movements" | "summary"> & {
  salesTotal: number | null;
  repairsTotal: number | null;
};

export type SaleItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountType: "AMOUNT" | "PERCENT" | null;
  discountValue: number;
  subtotal: number;
  /** IMEI / series vendidos */
  serials?: string[];
  warrantyUntil?: string | null;
};

export type SaleDetail = {
  id: string;
  number: number;
  subtotal: number;
  discountTotal: number;
  total: number;
  method: PaymentMethod;
  received: number | null;
  change: number | null;
  notes: string | null;
  status: "COMPLETED" | "VOIDED";
  createdAt: string;
  seller: string | null;
  items: SaleItem[];
  client: { id: string; name: string; phone: string | null; document: string | null } | null;
  business: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    taxId: string | null;
    receiptFooter: string | null;
    receiptShowLogo: boolean;
    currency: string;
    currencySymbol: string;
    timezone: string;
  };
};

export type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  method: PaymentMethod | null;
  date: string;
  updatesInventory: boolean;
  quantity: number | null;
  supplier: { id: string; name: string } | null;
  product: { id: string; name: string; unit: Unit } | null;
  receiptUrl: string | null;
};

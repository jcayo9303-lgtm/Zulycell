import type { PaymentMethod, RepairStatus } from "@/lib/labels";

export type RepairListItem = {
  id: string;
  number: number;
  status: RepairStatus;
  deviceType: string;
  brand: string;
  model: string;
  imei: string | null;
  color: string | null;
  reportedIssue: string;
  technicianId: string | null;
  technicianName: string | null;
  estimatedCost: number;
  laborCost: number;
  partsTotal: number;
  total: number;
  paid: number;
  balance: number;
  promisedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  client: { id: string; name: string; phone: string | null };
};

export type RepairList = {
  items: RepairListItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<RepairStatus, number>;
  stats: { inShop: number; ready: number; deliveredMonth: number; receivable: number };
};

export type RepairPart = {
  id: string;
  productId: string | null;
  variantId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
};

export type RepairPayment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  notes: string | null;
  createdAt: string;
};

export type RepairBusiness = {
  name: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  repairTerms: string | null;
  currency: string;
  currencySymbol: string;
  timezone: string;
};

export type RepairDetail = Omit<RepairListItem, "client"> & {
  accessCode: string | null;
  accessories: string | null;
  physicalCondition: string | null;
  diagnosis: string | null;
  warrantyDays: number;
  notes: string | null;
  receivedByName: string | null;
  allowedStatuses: RepairStatus[];
  client: { id: string; name: string; phone: string | null; document: string | null; email: string | null };
  parts: RepairPart[];
  payments: RepairPayment[];
  business: RepairBusiness;
};

/** Campos del equipo compartidos por el alta y la edición */
export type DeviceForm = {
  deviceType: string;
  brand: string;
  model: string;
  imei: string;
  color: string;
  accessCode: string;
  accessories: string[];
  accessoriesOther: string;
  reportedIssue: string;
  physicalCondition: string;
  estimatedCost: string;
  promisedAt: string;
  warrantyDays: string;
  technicianId: string;
  notes: string;
};

export const ACCESSORY_OPTIONS = ["Chip", "Memoria SD", "Funda", "Cargador", "Caja"] as const;

/** "Chip, Funda, cable USB" → partes marcadas + texto libre */
export function splitAccessories(value: string | null): { accessories: string[]; accessoriesOther: string } {
  const parts = (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const known = parts.filter((p) => (ACCESSORY_OPTIONS as readonly string[]).includes(p));
  return { accessories: known, accessoriesOther: parts.filter((p) => !known.includes(p)).join(", ") };
}

export function joinAccessories(f: Pick<DeviceForm, "accessories" | "accessoriesOther">): string {
  return [...f.accessories, f.accessoriesOther.trim()].filter(Boolean).join(", ");
}

/** ISO → valor de <input type="datetime-local"> en hora local */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export const isOverdue = (r: { promisedAt: string | null; status: RepairStatus }) =>
  Boolean(r.promisedAt) &&
  !["DELIVERED", "CANCELLED", "UNREPAIRABLE"].includes(r.status) &&
  new Date(r.promisedAt!).getTime() < Date.now();

// Etiquetas en español para los enums de la API.

export const PAYMENT_METHODS = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  QR: "QR",
  WALLET: "Billetera móvil",
  CREDIT: "Crédito (fiado)",
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export const UNITS = {
  UNIT: "Unidad",
  KG: "Kilogramo",
  G: "Gramo",
  L: "Litro",
  ML: "Mililitro",
  M: "Metro",
  BOX: "Caja",
} as const;
export type Unit = keyof typeof UNITS;

export const EXPENSE_CATEGORIES = {
  RENT: "Arriendo / alquiler",
  UTILITIES: "Servicios públicos",
  PAYROLL: "Nómina",
  MERCHANDISE: "Compra de mercancía",
  TRANSPORT: "Transporte",
  ADVERTISING: "Publicidad",
  OTHER: "Otros",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

export const BUSINESS_TYPES = {
  CELULARES: "Celulares y accesorios",
  GASTRONOMICO: "Gastronómico",
  COMERCIO: "Comercio",
  SERVICIOS: "Servicios",
  MERCADOS: "Mercados",
  OTRO: "Otro",
} as const;

export const STOCK_MOVEMENTS = {
  INITIAL: "Stock inicial",
  SALE: "Venta",
  SALE_VOID: "Venta anulada",
  RECIPE_SALE: "Venta (receta)",
  PURCHASE: "Compra",
  EXPENSE: "Gasto",
  ADJUST_IN: "Ajuste: entrada",
  ADJUST_OUT: "Ajuste: salida",
  ADJUST_SET: "Ajuste: corrección",
  REPAIR: "Repuesto en reparación",
  REPAIR_RETURN: "Repuesto devuelto",
} as const;

export const REPAIR_STATUS = {
  RECEIVED: "Recibido",
  DIAGNOSING: "En diagnóstico",
  WAITING_PARTS: "Esperando repuesto",
  REPAIRING: "En reparación",
  READY: "Listo para entregar",
  DELIVERED: "Entregado",
  UNREPAIRABLE: "Sin reparación",
  CANCELLED: "Cancelado",
} as const;
export type RepairStatus = keyof typeof REPAIR_STATUS;

export const DEVICE_TYPES = ["Celular", "Tablet", "Smartwatch", "Audífonos", "Laptop", "Otro"] as const;

export const INVOICE_TYPES = {
  SALE: "Factura de venta",
  CREDIT_NOTE: "Nota crédito",
  DEBIT_NOTE: "Nota débito",
} as const;

export const INVOICE_STATUS = {
  DRAFT: "Borrador",
  ISSUED: "Emitida",
  VOIDED: "Anulada",
} as const;

export const VARIANT_TYPES = ["Talla", "Color", "Presentación", "Personalizado"] as const;

export function options<T extends Record<string, string>>(map: T) {
  return (Object.keys(map) as (keyof T & string)[]).map((value) => ({ value, label: map[value] }));
}

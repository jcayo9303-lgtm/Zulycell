// Permisos por módulo (docs §15). El propietario (OWNER) tiene todos.

export const PERMISSIONS = {
  sales_view: "Ver ventas",
  sales_create: "Registrar ventas",
  expenses_view: "Ver gastos",
  expenses_create: "Registrar gastos",
  inventory_view: "Ver inventario",
  inventory_edit: "Editar inventario",
  clients_view: "Ver clientes",
  clients_edit: "Editar clientes",
  stats_view: "Ver estadísticas",
  balance_view: "Ver balance",
  cash_manage: "Abrir y cerrar caja",
  repairs_view: "Ver reparaciones",
  repairs_edit: "Registrar reparaciones",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export type PermissionMap = Partial<Record<Permission, boolean>>;

export function normalizePermissions(raw: unknown): PermissionMap {
  const out: PermissionMap = {};
  if (raw && typeof raw === "object") {
    for (const key of PERMISSION_KEYS) out[key] = Boolean((raw as Record<string, unknown>)[key]);
  }
  return out;
}

export const ALL_PERMISSIONS: PermissionMap = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]));

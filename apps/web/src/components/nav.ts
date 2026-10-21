import {
  BarChart3,
  ChefHat,
  FileText,
  History,
  Landmark,
  Package,
  QrCode,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  UserCog,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/session";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permisos que dan acceso (cualquiera). Sin valor = cualquier miembro. */
  perms?: Permission[];
  ownerOnly?: boolean;
  /** Solo se muestra para estos tipos de negocio */
  businessTypes?: string[];
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { href: "/balance", label: "Balance del día", icon: Wallet, perms: ["balance_view", "sales_view", "expenses_view"] },
      { href: "/vender", label: "Vender", icon: ShoppingCart, perms: ["sales_create"] },
      { href: "/caja", label: "Caja", icon: Landmark, perms: ["cash_manage", "balance_view"] },
      { href: "/reparaciones", label: "Reparaciones", icon: Wrench, perms: ["repairs_view", "repairs_edit"] },
      { href: "/cotizaciones", label: "Cotizaciones", icon: FileText, perms: ["sales_create"] },
      { href: "/cobros-qr", label: "QR de pago", icon: QrCode, perms: ["sales_create"] },
    ],
  },
  {
    label: "Historial",
    items: [
      { href: "/ventas", label: "Ventas e ingresos", icon: History, perms: ["sales_view"] },
      { href: "/garantias", label: "Garantías e IMEI", icon: ShieldCheck, perms: ["sales_view", "repairs_view"] },
      { href: "/facturas", label: "Factura electrónica", icon: Receipt, perms: ["sales_create"] },
    ],
  },
  {
    label: "Inventario",
    items: [
      { href: "/inventario", label: "Productos", icon: Package, perms: ["inventory_view", "inventory_edit"] },
      { href: "/recetas", label: "Recetas", icon: ChefHat, perms: ["inventory_edit"], businessTypes: ["GASTRONOMICO"] },
      { href: "/catalogo", label: "Catálogo y tienda", icon: Store, perms: ["inventory_edit"] },
    ],
  },
  {
    label: "Contactos",
    items: [
      { href: "/clientes", label: "Clientes", icon: Users, perms: ["clients_view", "clients_edit"] },
      { href: "/proveedores", label: "Proveedores", icon: Truck, perms: ["inventory_edit"] },
    ],
  },
  {
    label: "Negocio",
    items: [
      { href: "/estadisticas", label: "Estadísticas", icon: BarChart3, perms: ["stats_view"] },
      { href: "/empleados", label: "Empleados", icon: UserCog, ownerOnly: true },
      { href: "/configuracion", label: "Configuración", icon: Settings, ownerOnly: true },
    ],
  },
];

"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { fmtMoney } from "./format";

export type Permission =
  | "sales_view"
  | "sales_create"
  | "expenses_view"
  | "expenses_create"
  | "inventory_view"
  | "inventory_edit"
  | "clients_view"
  | "clients_edit"
  | "stats_view"
  | "balance_view"
  | "cash_manage"
  | "repairs_view"
  | "repairs_edit";

export type Me = {
  user: { id: string; name: string; phone: string | null; email: string | null };
  role: "OWNER" | "EMPLOYEE";
  permissions: Partial<Record<Permission, boolean>>;
  business: {
    id: string;
    name: string;
    type: string;
    country: string;
    currency: string;
    currencySymbol: string;
    timezone: string;
    plan: "FREE" | "PRO";
    slug: string;
    logoUrl: string | null;
  };
  businesses: { id: string; name: string; role: string }[];
};

type SessionValue = {
  me: Me;
  refresh: () => Promise<void>;
  isOwner: boolean;
  can: (...perms: Permission[]) => boolean;
  money: (n: number | null | undefined) => string;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    setMe(await api.get<Me>("/auth/me"));
  }, []);

  useEffect(() => {
    refresh().catch(() => {
      window.location.href = "/login";
    });
  }, [refresh]);

  if (!me) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }} className="muted">
        Cargando…
      </div>
    );
  }

  const isOwner = me.role === "OWNER";
  const value: SessionValue = {
    me,
    refresh,
    isOwner,
    can: (...perms) => isOwner || perms.some((p) => me.permissions[p]),
    money: (n) => fmtMoney(n, me.business.currency, me.business.currencySymbol),
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}

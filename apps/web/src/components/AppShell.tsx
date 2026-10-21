"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogOut, Menu } from "lucide-react";
import s from "./AppShell.module.css";
import { NAV, type NavItem } from "./nav";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button } from "./ui";

export function AppShell({ children }: { children: ReactNode }) {
  const { me, can, isOwner } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const visible = (item: NavItem) =>
    (!item.businessTypes || item.businessTypes.includes(me.business.type)) &&
    (item.ownerOnly ? isOwner : !item.perms || can(...item.perms));

  const logout = async () => {
    await Promise.allSettled([api.post("/auth/logout"), supabase().auth.signOut()]);
    window.location.href = "/login";
  };

  const switchBusiness = async (businessId: string) => {
    await api.post("/auth/switch", { businessId });
    window.location.href = "/balance";
  };

  return (
    <div className={s.shell}>
      <header className={s.topbar}>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="Abrir menú" icon={<Menu size={18} />} />
        <span>{me.business.name}</span>
      </header>

      {open && <div className={s.backdrop} onClick={() => setOpen(false)} />}

      <aside className={`${s.sidebar} ${open ? s.sidebarOpen : ""}`}>
        <div className={s.brand}>
          <div
            className={s.brandLogo}
            style={{ backgroundImage: `url("${me.business.logoUrl ?? "/logo-icon-192.png"}")` }}
          />
          <div style={{ minWidth: 0 }}>
            <div className={s.brandName}>{me.business.name}</div>
          </div>
        </div>

        <nav>
          {NAV.map((group) => {
            const items = group.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={group.label} className={s.group}>
                <div className={s.groupLabel}>{group.label}</div>
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`${s.link} ${active ? s.active : ""}`}
                      onClick={() => setOpen(false)}
                    >
                      <Icon size={15} strokeWidth={1.9} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className={s.footer}>
          {me.businesses.length > 1 && (
            <select value={me.business.id} onChange={(e) => switchBusiness(e.target.value)} aria-label="Cambiar de negocio">
              {me.businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <div className={s.user}>
            <div className={s.userName}>{me.user.name}</div>
            {isOwner ? "Propietario" : "Empleado"} · {me.user.phone ?? me.user.email}
          </div>
          <button className={s.link} onClick={logout} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className={s.main}>{children}</main>
    </div>
  );
}

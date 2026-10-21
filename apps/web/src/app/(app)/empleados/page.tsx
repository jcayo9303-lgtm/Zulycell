"use client";

import { useState, type FormEvent } from "react";
import { MessageCircle, Plus } from "lucide-react";
import s from "@/components/contacts/contacts.module.css";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Toggle, useConfirm, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import type { Permission } from "@/lib/session";

type Employee = {
  membershipId: string;
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  role: "OWNER" | "EMPLOYEE";
  active: boolean;
  permissions: Partial<Record<Permission, boolean>>;
};

type PermissionDef = { key: Permission; label: string };

const DEFAULT_PERMS: Partial<Record<Permission, boolean>> = { sales_view: true, sales_create: true, inventory_view: true, clients_view: true };

export default function EmployeesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const employees = useFetch(() => api.get<Employee[]>("/employees"));
  const perms = useFetch(() => api.get<PermissionDef[]>("/meta/permissions"));
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", position: "", permissions: DEFAULT_PERMS, active: true });
  const [invite, setInvite] = useState<{ name: string; email: string; url: string | null; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const open = (e: Employee | "new") => {
    setEditing(e);
    setError(null);
    setFields({});
    setForm(
      e === "new"
        ? { name: "", email: "", phone: "", position: "", permissions: DEFAULT_PERMS, active: true }
        : { name: e.name, email: e.email ?? "", phone: e.phone ?? "", position: e.position ?? "", permissions: e.permissions, active: e.active },
    );
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (editing === "new") {
        const created = await api.post<Employee & { inviteUrl: string | null; inviteText: string }>("/employees", {
          name: form.name,
          email: form.email,
          phone: form.phone,
          position: form.position,
          permissions: form.permissions,
        });
        setInvite({ name: created.name, email: form.email, url: created.inviteUrl, text: created.inviteText });
      } else {
        await api.put(`/employees/${editing.membershipId}`, {
          position: form.position,
          permissions: form.permissions,
          active: form.active,
        });
        toast("Permisos actualizados");
      }
      setEditing(null);
      void employees.reload();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      }
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = async (e: Employee) => {
    try {
      const r = await api.get<{ url: string | null; text: string }>(`/employees/${e.membershipId}/invite`);
      if (r.url) window.open(r.url, "_blank", "noopener");
      else {
        await navigator.clipboard.writeText(r.text);
        toast("Invitación copiada: envíala por el medio que prefieras");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo generar la invitación", true);
    }
  };

  const revoke = async (e: Employee) => {
    if (!confirm(`¿Quitar el acceso de ${e.name} al negocio?`)) return;
    await api.del(`/employees/${e.membershipId}`);
    toast("Acceso revocado");
    void employees.reload();
  };

  const isNew = editing === "new";

  return (
    <>
      <PageHeader
        title="Empleados"
        subtitle="Da acceso a tu equipo y controla qué puede ver o registrar cada persona"
        actions={
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => open("new")}>
            Agregar empleado
          </Button>
        }
      />

      <Card flush>
        {employees.loading && !employees.data ? (
          <Loading />
        ) : !employees.data?.length ? (
          <Empty title="Sin empleados" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Cargo</th>
                  <th>Email</th>
                  <th>Estado</th>
                  <th className="num">Permisos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {employees.data.map((e) => {
                  const count = Object.values(e.permissions).filter(Boolean).length;
                  const owner = e.role === "OWNER";
                  return (
                    <tr key={e.membershipId}>
                      <td>{e.name}</td>
                      <td className="muted">{owner ? "Propietario" : (e.position ?? "—")}</td>
                      <td className="muted">{e.email ?? "—"}</td>
                      <td>{e.active ? <Badge tone="success">Activo</Badge> : <Badge>Sin acceso</Badge>}</td>
                      <td className="num">{owner ? "Todos" : `${count} de ${perms.data?.length ?? 10}`}</td>
                      <td className="num">
                        {!owner && (
                          <div className="row" style={{ justifyContent: "flex-end" }}>
                            <Button size="sm" variant="ghost" icon={<MessageCircle size={13} />} disabled={!e.email} onClick={() => sendInvite(e)}>
                              Invitar
                            </Button>
                            <Button size="sm" onClick={() => open(e)}>
                              Editar permisos
                            </Button>
                            {e.active && (
                              <Button size="sm" variant="danger" onClick={() => revoke(e)}>
                                Eliminar
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={isNew ? "Agregar empleado" : "Editar permisos"}
        width={560}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              variant="primary"
              type="submit"
              form="employee-form"
              loading={busy}
              disabled={isNew && (!form.name.trim() || !form.email.trim())}
            >
              {isNew ? "Agregar y generar invitación" : "Guardar"}
            </Button>
          </>
        }
      >
        <form id="employee-form" className="stack" onSubmit={submit}>
          <div className="grid-2">
            <Field label="Nombre del empleado" required error={fields.name}>
              <Input autoFocus={isNew} disabled={!isNew} maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email" required hint={isNew ? "Con este email creará su contraseña" : undefined} error={fields.email}>
              <Input type="email" disabled={!isNew} maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <Field label="Celular / WhatsApp" hint="Opcional: para enviarle la invitación por WhatsApp" error={fields.phone}>
            <Input inputMode="tel" disabled={!isNew} maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Cargo / rol" error={fields.position}>
            <Input maxLength={100} placeholder="Cajero, vendedor, bodega…" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          </Field>
          <div className="section-title">Permisos por módulo</div>
          <div className={s.perms}>
            {perms.data?.map((p) => (
              <Toggle
                key={p.key}
                label={p.label}
                checked={Boolean(form.permissions[p.key])}
                onChange={(v) => setForm({ ...form, permissions: { ...form.permissions, [p.key]: v } })}
              />
            ))}
          </div>
          {!isNew && <Toggle label="Acceso activo" checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />}
          {error && <Alert>{error}</Alert>}
        </form>
      </Modal>

      <Modal
        open={invite !== null}
        onClose={() => setInvite(null)}
        title="Empleado agregado"
        width={420}
        footer={
          <>
            <Button onClick={() => setInvite(null)}>Cerrar</Button>
            <Button onClick={() => invite && navigator.clipboard.writeText(invite.text).then(() => toast("Invitación copiada"))}>
              Copiar invitación
            </Button>
            {invite?.url && (
              <Button variant="primary" icon={<MessageCircle size={14} />} onClick={() => window.open(invite.url!, "_blank", "noopener")}>
                Enviar por WhatsApp
              </Button>
            )}
          </>
        }
      >
        <p>
          {invite?.name} debe crear su cuenta en Zulycell con el email <strong>{invite?.email}</strong> y confirmar el correo de verificación. Al ingresar verá tu negocio con los permisos que le diste.
        </p>
      </Modal>
    </>
  );
}

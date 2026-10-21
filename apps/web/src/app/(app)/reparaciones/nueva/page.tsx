"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Combobox, Field, Input, PageHeader, Select, useToast } from "@/components/ui";
import { DeviceFields, emptyDevice, type Technician } from "@/components/repairs/DeviceFields";
import { joinAccessories, type DeviceForm } from "@/components/repairs/types";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { PAYMENT_METHODS, options } from "@/lib/labels";

type ClientOption = { id: string; name: string; phone: string | null };

const ADVANCE_METHODS = options(PAYMENT_METHODS).filter((o) => o.value !== "CREDIT");

export default function NewRepairPage() {
  const router = useRouter();
  const toast = useToast();
  const { isOwner, money } = useSession();
  const [client, setClient] = useState<ClientOption | null>(null);
  const [newClient, setNewClient] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [device, setDevice] = useState<DeviceForm>(emptyDevice());
  const [advance, setAdvance] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState("CASH");
  const [technicians, setTechnicians] = useState<Technician[] | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    api
      .get<(Technician & { active: boolean })[]>("/employees")
      .then((list) => setTechnicians(list.filter((e) => e.active)))
      .catch(() => setTechnicians(null));
  }, [isOwner]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const created = await api.post<{ id: string; number: number }>("/repairs", {
        clientId: newClient ? null : client?.id ?? null,
        client: newClient ? { name: clientName, phone: clientPhone } : null,
        deviceType: device.deviceType,
        brand: device.brand,
        model: device.model,
        imei: device.imei,
        color: device.color,
        accessCode: device.accessCode,
        accessories: joinAccessories(device),
        reportedIssue: device.reportedIssue,
        physicalCondition: device.physicalCondition,
        estimatedCost: device.estimatedCost || 0,
        promisedAt: device.promisedAt ? new Date(device.promisedAt).toISOString() : null,
        warrantyDays: device.warrantyDays || 0,
        technicianId: device.technicianId || null,
        notes: device.notes,
        advance: Number(advance) > 0 ? { amount: advance, method: advanceMethod } : null,
      });
      toast(`Orden N.º ${created.number} creada`);
      router.push(`/reparaciones/${created.id}?imprimir=1`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      } else setError("No se pudo guardar la orden.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <PageHeader
        title="Nueva orden de reparación"
        subtitle="Registra el equipo que deja el cliente. Al guardar podrás imprimir la orden para que la firme."
        actions={
          <>
            <Link href="/reparaciones">
              <Button>Cancelar</Button>
            </Link>
            <Button type="submit" variant="primary" loading={busy}>
              Guardar orden
            </Button>
          </>
        }
      />

      <div className="stack">
        {error && <Alert>{error}</Alert>}

        <Card
          title="Cliente"
          actions={
            <Button size="sm" variant="ghost" onClick={() => (setNewClient(!newClient), setClient(null))}>
              {newClient ? "Buscar cliente existente" : "+ Cliente nuevo"}
            </Button>
          }
        >
          {newClient ? (
            <div className="grid-2">
              <Field label="Nombre" required error={fields["client.name"]}>
                <Input autoFocus maxLength={100} value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </Field>
              <Field label="Celular / WhatsApp" hint="Para avisarle cuando el equipo esté listo" error={fields["client.phone"]}>
                <Input inputMode="tel" maxLength={20} value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
              </Field>
            </div>
          ) : (
            <Field label="Buscar cliente" required error={fields.clientId}>
              <Combobox<ClientOption>
                autoFocus
                placeholder="Nombre, celular o documento"
                value={client ? `${client.name}${client.phone ? ` · ${client.phone}` : ""}` : null}
                onClear={() => setClient(null)}
                onSelect={setClient}
                fetcher={(q) => api.get<{ items: ClientOption[] }>("/clients", { q, pageSize: 10 }).then((r) => r.items)}
                renderItem={(c) => (
                  <div className="row-between">
                    <span>{c.name}</span>
                    <span className="note">{c.phone ?? ""}</span>
                  </div>
                )}
              />
            </Field>
          )}
        </Card>

        <Card title="Equipo y falla">
          <DeviceFields value={device} onChange={setDevice} fields={fields} technicians={technicians} />
        </Card>

        <Card title="Adelanto">
          <div className="grid-3">
            <Field label="Monto del adelanto" hint="Opcional. Cuenta como ingreso del día." error={fields["advance.amount"]}>
              <Input type="number" min={0} step="0.01" className="num" value={advance} onChange={(e) => setAdvance(e.target.value)} />
            </Field>
            <Field label="Método de pago">
              <Select value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value)} options={ADVANCE_METHODS} />
            </Field>
            {Number(device.estimatedCost) > 0 && (
              <Field label="Saldo estimado al entregar">
                <Input readOnly className="num" value={money(Math.max(0, Number(device.estimatedCost) - (Number(advance) || 0)))} />
              </Field>
            )}
          </div>
        </Card>
      </div>
    </form>
  );
}

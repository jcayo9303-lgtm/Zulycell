"use client";

import s from "./repairs.module.css";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { DEVICE_TYPES } from "@/lib/labels";
import { ACCESSORY_OPTIONS, type DeviceForm } from "./types";

export type Technician = { userId: string; name: string };

export function emptyDevice(): DeviceForm {
  return {
    deviceType: "Celular",
    brand: "",
    model: "",
    imei: "",
    color: "",
    accessCode: "",
    accessories: [],
    accessoriesOther: "",
    reportedIssue: "",
    physicalCondition: "",
    estimatedCost: "",
    promisedAt: "",
    warrantyDays: "30",
    technicianId: "",
    notes: "",
  };
}

/** Datos del equipo, falla y condiciones del servicio */
export function DeviceFields({
  value,
  onChange,
  fields,
  technicians,
  showCost = true,
}: {
  value: DeviceForm;
  onChange: (v: DeviceForm) => void;
  fields: Record<string, string>;
  technicians: Technician[] | null;
  showCost?: boolean;
}) {
  const set = <K extends keyof DeviceForm>(k: K, v: DeviceForm[K]) => onChange({ ...value, [k]: v });
  const toggleAccessory = (a: string) =>
    set("accessories", value.accessories.includes(a) ? value.accessories.filter((x) => x !== a) : [...value.accessories, a]);

  return (
    <div className="stack">
      <div className="grid-3">
        <Field label="Tipo de equipo" required error={fields.deviceType}>
          <Select
            value={value.deviceType}
            onChange={(e) => set("deviceType", e.target.value)}
            options={DEVICE_TYPES.map((d) => ({ value: d, label: d }))}
          />
        </Field>
        <Field label="Marca" required error={fields.brand}>
          <Input maxLength={60} placeholder="Samsung, Apple, Xiaomi…" value={value.brand} onChange={(e) => set("brand", e.target.value)} />
        </Field>
        <Field label="Modelo" required error={fields.model}>
          <Input maxLength={80} placeholder="Galaxy A54, iPhone 13…" value={value.model} onChange={(e) => set("model", e.target.value)} />
        </Field>
      </div>

      <div className="grid-3">
        <Field label="IMEI / número de serie" hint="Marca *#06# en el equipo" error={fields.imei}>
          <Input
            className="mono"
            maxLength={30}
            inputMode="numeric"
            value={value.imei}
            onChange={(e) => set("imei", e.target.value.replace(/\s/g, ""))}
          />
        </Field>
        <Field label="Color" error={fields.color}>
          <Input maxLength={30} value={value.color} onChange={(e) => set("color", e.target.value)} />
        </Field>
        <Field label="Clave o patrón de desbloqueo" hint="Solo se muestra en el detalle de la orden" error={fields.accessCode}>
          <Input
            className={s.secret}
            maxLength={60}
            autoComplete="off"
            placeholder="Ej.: 1234 o patrón en L"
            value={value.accessCode}
            onChange={(e) => set("accessCode", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Accesorios recibidos" error={fields.accessories}>
        <div className="stack" style={{ gap: 8 }}>
          <div className={s.checks}>
            {ACCESSORY_OPTIONS.map((a) => (
              <label key={a} className={s.check}>
                <input type="checkbox" checked={value.accessories.includes(a)} onChange={() => toggleAccessory(a)} />
                {a}
              </label>
            ))}
          </div>
          <Input
            maxLength={150}
            placeholder="Otros accesorios"
            value={value.accessoriesOther}
            onChange={(e) => set("accessoriesOther", e.target.value)}
          />
        </div>
      </Field>

      <div className="grid-2">
        <Field label="Falla reportada" required error={fields.reportedIssue}>
          <Textarea
            maxLength={500}
            rows={3}
            placeholder="Lo que describe el cliente: no carga, pantalla rota, se apaga…"
            value={value.reportedIssue}
            onChange={(e) => set("reportedIssue", e.target.value)}
          />
        </Field>
        <Field label="Estado físico al recibir" error={fields.physicalCondition}>
          <Textarea
            maxLength={500}
            rows={3}
            placeholder="Rayones, golpes, pantalla trizada, tapa despegada…"
            value={value.physicalCondition}
            onChange={(e) => set("physicalCondition", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid-3">
        {showCost && (
          <Field label="Costo estimado" error={fields.estimatedCost}>
            <Input
              type="number"
              min={0}
              step="0.01"
              className="num"
              value={value.estimatedCost}
              onChange={(e) => set("estimatedCost", e.target.value)}
            />
          </Field>
        )}
        <Field label="Fecha prometida de entrega" error={fields.promisedAt}>
          <Input type="datetime-local" value={value.promisedAt} onChange={(e) => set("promisedAt", e.target.value)} />
        </Field>
        <Field label="Garantía (días)" error={fields.warrantyDays}>
          <Input
            type="number"
            min={0}
            step={1}
            className="num"
            value={value.warrantyDays}
            onChange={(e) => set("warrantyDays", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid-2">
        {technicians && (
          <Field label="Técnico asignado" error={fields.technicianId}>
            <Select
              value={value.technicianId}
              onChange={(e) => set("technicianId", e.target.value)}
              placeholder="Sin asignar"
              options={technicians.map((t) => ({ value: t.userId, label: t.name }))}
            />
          </Field>
        )}
        <Field label="Notas internas" error={fields.notes}>
          <Input maxLength={500} value={value.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

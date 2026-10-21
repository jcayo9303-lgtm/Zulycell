"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, ImageUpload, Input, Loading, PageHeader, Select, Textarea, Toggle, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtSeq } from "@/lib/format";
import { BUSINESS_TYPES, options } from "@/lib/labels";
import { useSession } from "@/lib/session";

type Settings = {
  name: string;
  type: string;
  country: string;
  currency: string;
  currencySymbol: string;
  timezone: string;
  logoKey: string | null;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  receiptShowLogo: boolean;
  receiptFooter: string | null;
  nextSaleNumber: number;
  allowNegativeStock: boolean;
  repairTerms: string | null;
  slug: string;
};

type Country = { code: string; name: string; currency: string };

type Form = Omit<Settings, "address" | "phone" | "email" | "taxId" | "receiptFooter" | "nextSaleNumber" | "repairTerms"> & {
  address: string;
  phone: string;
  email: string;
  taxId: string;
  receiptFooter: string;
  nextSaleNumber: string;
  repairTerms: string;
};

export default function SettingsPage() {
  const toast = useToast();
  const { refresh } = useSession();
  const settings = useFetch(() => api.get<Settings>("/business"));
  const countries = useFetch(() => api.get<Country[]>("/meta/countries"));
  const [form, setForm] = useState<Form | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = settings.data;
    if (!d) return;
    setForm({
      ...d,
      address: d.address ?? "",
      phone: d.phone ?? "",
      email: d.email ?? "",
      taxId: d.taxId ?? "",
      receiptFooter: d.receiptFooter ?? "",
      nextSaleNumber: String(d.nextSaleNumber),
      repairTerms: d.repairTerms ?? "",
    });
  }, [settings.data]);

  if (settings.error) return <Alert>{settings.error}</Alert>;
  if (!form) return <Loading />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const country = countries.data?.find((c) => c.code === form.country);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api.put("/business", {
        name: form.name,
        type: form.type,
        country: form.country,
        logoKey: form.logoKey,
        address: form.address,
        phone: form.phone,
        email: form.email,
        taxId: form.taxId,
        receiptShowLogo: form.receiptShowLogo,
        receiptFooter: form.receiptFooter,
        nextSaleNumber: Number(form.nextSaleNumber),
        allowNegativeStock: form.allowNegativeStock,
        repairTerms: form.repairTerms,
      });
      await Promise.all([refresh(), settings.reload()]);
      toast("Configuración guardada");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <PageHeader
        title="Configuración"
        subtitle="Datos del negocio, comprobantes e inventario"
        actions={
          <Button variant="primary" type="submit" loading={busy}>
            Guardar cambios
          </Button>
        }
      />

      <div className="stack" style={{ maxWidth: 860 }}>
        {error && <Alert>{error}</Alert>}

        <Card title="Datos del negocio">
          <div className="stack">
            <Field label="Logo del negocio" hint="Aparece en comprobantes y en el catálogo">
              <ImageUpload
                folder="logos"
                url={form.logoUrl}
                onChange={(v) => setForm({ ...form, logoKey: v?.key ?? null, logoUrl: v?.url ?? null })}
              />
            </Field>
            <div className="grid-2">
              <Field label="Nombre del negocio" required error={fields.name}>
                <Input maxLength={100} value={form.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Tipo de negocio" error={fields.type}>
                <Select value={form.type} onChange={(e) => set("type", e.target.value)} options={options(BUSINESS_TYPES)} />
              </Field>
              <Field label="País" required hint={country ? `Moneda: ${country.currency}` : undefined} error={fields.country}>
                <Select
                  value={form.country}
                  onChange={(e) => set("country", e.target.value)}
                  options={(countries.data ?? []).map((c) => ({ value: c.code, label: c.name }))}
                />
              </Field>
              <Field label="NIT / RUT del negocio" hint="Necesario para facturación electrónica" error={fields.taxId}>
                <Input className="mono" maxLength={20} value={form.taxId} onChange={(e) => set("taxId", e.target.value)} />
              </Field>
              <Field label="Teléfono del negocio" error={fields.phone}>
                <Input inputMode="tel" maxLength={20} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Email del negocio" error={fields.email}>
                <Input type="email" maxLength={254} value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
            </div>
            <Field label="Dirección" hint="Aparece en facturas" error={fields.address}>
              <Input maxLength={255} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <p className="note">
              Zona horaria: {form.timezone} · Enlace del catálogo: <span className="mono">{form.slug}</span>
            </p>
          </div>
        </Card>

        <Card title="Comprobantes">
          <div className="stack">
            <Toggle label="Mostrar logo en comprobante" checked={form.receiptShowLogo} onChange={(v) => set("receiptShowLogo", v)} />
            <Field label="Mensaje de pie de página" hint="Ej.: ¡Gracias por su compra!" error={fields.receiptFooter}>
              <Input maxLength={255} value={form.receiptFooter} onChange={(e) => set("receiptFooter", e.target.value)} />
            </Field>
            <Field
              label="Próximo número de comprobante"
              hint={`El siguiente comprobante será el N.º ${fmtSeq(Number(form.nextSaleNumber) || 1)}`}
              error={fields.nextSaleNumber}
            >
              <Input
                type="number"
                min={1}
                step={1}
                className="num mono"
                style={{ maxWidth: 200 }}
                value={form.nextSaleNumber}
                onChange={(e) => set("nextSaleNumber", e.target.value)}
              />
            </Field>
          </div>
        </Card>

        <Card title="Inventario">
          <div className="stack">
            <Toggle
              label="Permitir vender sin stock"
              checked={form.allowNegativeStock}
              onChange={(v) => set("allowNegativeStock", v)}
            />
            <p className="note">Si está desactivado, el punto de venta bloquea las ventas de productos sin unidades disponibles.</p>
          </div>
        </Card>

        <Card title="Servicio técnico">
          <Field
            label="Términos de la orden de reparación"
            hint="Se imprimen en la orden que firma el cliente. Máximo 1000 caracteres."
            error={fields.repairTerms}
          >
            <Textarea
              maxLength={1000}
              rows={5}
              value={form.repairTerms}
              onChange={(e) => set("repairTerms", e.target.value)}
              placeholder="Ej.: Equipos no retirados en 90 días pasan a remate. La garantía no cubre golpes ni humedad."
            />
          </Field>
        </Card>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Copy, ExternalLink, MessageCircle, Printer } from "lucide-react";
import { Alert, Button, Card, Field, ImageUpload, Input, Loading, PageHeader, Textarea, Toggle, useToast } from "@/components/ui";
import { QrImage } from "@/components/QrImage";
import s from "@/components/inventory/inventory.module.css";
import { api, ApiError } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { fmtQty } from "@/lib/format";
import { useSession } from "@/lib/session";

type CatalogConfig = {
  name: string;
  slug: string;
  url: string;
  catalogEnabled: boolean;
  catalogColor: string;
  catalogDescription: string | null;
  catalogWhatsapp: string | null;
  logoKey: string | null;
  logoUrl: string | null;
  catalogBannerKey: string | null;
  bannerUrl: string | null;
  products: {
    id: string;
    name: string;
    price: number;
    imageUrl: string | null;
    categoryName: string | null;
    isRecipe: boolean;
    stock: number;
    trackStock: boolean;
    visibleInCatalog: boolean;
  }[];
};

type Img = { key: string | null; url: string | null };

export default function CatalogPage() {
  const { money } = useSession();
  const toast = useToast();
  const { data, setData, loading, error } = useFetch(() => api.get<CatalogConfig>("/catalog"), []);
  const [enabled, setEnabled] = useState(true);
  const [color, setColor] = useState("#D9432B");
  const [description, setDescription] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [logo, setLogo] = useState<Img>({ key: null, url: null });
  const [banner, setBanner] = useState<Img>({ key: null, url: null });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setEnabled(data.catalogEnabled);
    setColor(data.catalogColor);
    setDescription(data.catalogDescription ?? "");
    setWhatsapp(data.catalogWhatsapp ?? "");
    setLogo({ key: data.logoKey, url: data.logoUrl });
    setBanner({ key: data.catalogBannerKey, url: data.bannerUrl });
  }, [data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setFields({});
    try {
      await api.put("/catalog", {
        catalogEnabled: enabled,
        catalogColor: color,
        catalogDescription: description,
        catalogWhatsapp: whatsapp,
        logoKey: logo.key,
        catalogBannerKey: banner.key,
      });
      toast("Catálogo actualizado");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "No se pudo guardar");
      if (err instanceof ApiError) setFields(err.fields ?? {});
    } finally {
      setBusy(false);
    }
  }

  async function toggleProduct(id: string, visibleInCatalog: boolean) {
    if (!data) return;
    setData({ ...data, products: data.products.map((p) => (p.id === id ? { ...p, visibleInCatalog } : p)) });
    try {
      await api.patch(`/catalog/products/${id}`, { visibleInCatalog });
    } catch {
      toast("No se pudo actualizar el producto", true);
      setData({ ...data });
    }
  }

  if (loading && !data) return <Loading />;
  if (error || !data) return <Alert>{error ?? "No se pudo cargar el catálogo"}</Alert>;

  const shareText = `Mira nuestro catálogo de ${data.name}: ${data.url}`;
  const visibleCount = data.products.filter((p) => p.visibleInCatalog).length;

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Catálogo y tienda online"
          subtitle="Tu tienda digital con enlace y QR para compartir"
          actions={
            <Button icon={<ExternalLink size={14} />} onClick={() => window.open(data.url, "_blank", "noopener")}>
              Ver catálogo
            </Button>
          }
        />
      </div>

      <div className="grid-2" style={{ alignItems: "start", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}>
        <div className="stack no-print">
          <Card title="Configuración">
            <form className="stack" onSubmit={save}>
              <Toggle checked={enabled} onChange={setEnabled} label="Catálogo público activo" />
              <Field label="Nombre del negocio" hint="Se cambia en Configuración">
                <Input value={data.name} readOnly disabled />
              </Field>
              <div className="grid-2">
                <Field label="Logo del negocio">
                  <ImageUpload folder="logos" url={logo.url} onChange={(img) => setLogo({ key: img?.key ?? null, url: img?.url ?? null })} />
                </Field>
                <Field label="Banner / portada" hint="Recomendado 1200×400 px">
                  <ImageUpload folder="banners" url={banner.url} onChange={(img) => setBanner({ key: img?.key ?? null, url: img?.url ?? null })} />
                </Field>
              </div>
              <div className="grid-2">
                <Field label="Color principal" error={fields.catalogColor}>
                  <div className="row">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      aria-label="Elegir color"
                      style={{ width: 40, height: 32, padding: 0, border: "none", background: "none" }}
                    />
                    <Input className="mono" maxLength={7} value={color} onChange={(e) => setColor(e.target.value)} />
                  </div>
                </Field>
                <Field label="WhatsApp de contacto" hint="Aquí llegan los pedidos" error={fields.catalogWhatsapp}>
                  <Input inputMode="tel" maxLength={20} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                </Field>
              </div>
              <Field label="Descripción del negocio" hint={`${description.length}/500`} error={fields.catalogDescription}>
                <Textarea maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              {formError && <Alert>{formError}</Alert>}
              <div>
                <Button type="submit" variant="primary" loading={busy}>
                  Guardar cambios
                </Button>
              </div>
            </form>
          </Card>

          <Card title={`Productos visibles (${visibleCount} de ${data.products.length})`} flush>
            <div className="table-wrap" style={{ maxHeight: 480, overflowY: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }} />
                    <th>Producto</th>
                    <th className="num">Precio</th>
                    <th className="num">Stock</th>
                    <th>Visible</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className={s.thumb} style={p.imageUrl ? { backgroundImage: `url("${p.imageUrl}")` } : undefined} />
                      </td>
                      <td>
                        {p.name}
                        {p.categoryName && <div className="note">{p.categoryName}</div>}
                      </td>
                      <td className="num">{money(p.price)}</td>
                      <td className="num muted">{p.trackStock && !p.isRecipe ? fmtQty(p.stock) : "—"}</td>
                      <td>
                        <Toggle checked={p.visibleInCatalog} onChange={(v) => toggleProduct(p.id, v)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <Card title="QR del catálogo">
          <div className="stack" style={{ alignItems: "center", textAlign: "center" }}>
            <div className="print-only page-title">{data.name}</div>
            <QrImage value={data.url} size={220} downloadName={`catalogo-${data.slug}`} />
            <code className="note" style={{ wordBreak: "break-all" }}>
              {data.url}
            </code>
            {!enabled && <Alert tone="info">El catálogo está desactivado: el enlace mostrará “no disponible”.</Alert>}
            <div className="row wrap no-print" style={{ justifyContent: "center" }}>
              <Button
                size="sm"
                icon={<Copy size={14} />}
                onClick={() => navigator.clipboard.writeText(data.url).then(() => toast("Enlace copiado"))}
              >
                Copiar enlace
              </Button>
              <Button
                size="sm"
                icon={<MessageCircle size={14} />}
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener")}
              >
                Compartir por WhatsApp
              </Button>
              <Button size="sm" icon={<Printer size={14} />} onClick={() => window.print()}>
                Imprimir QR
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

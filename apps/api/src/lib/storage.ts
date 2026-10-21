import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { supabaseAdmin } from "./supabase.js";

// Imágenes en Supabase Storage.
//  - Bucket público: fotos de productos, logos y banners (se ven en el catálogo sin sesión).
//  - Bucket privado: comprobantes de gastos y facturas de compra (enlace firmado de corta duración).

const PUBLIC_FOLDERS = new Set(["products", "logos", "banners"]);

const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function isAllowedImage(mime: string) {
  return ALLOWED.has(mime);
}

const folderOf = (key: string) => key.split("/")[1] ?? "";
const bucketFor = (key: string) =>
  PUBLIC_FOLDERS.has(folderOf(key)) ? config.supabase.publicBucket : config.supabase.privateBucket;

/** Sube una imagen y devuelve su clave: {businessId}/{carpeta}/{uuid}.{ext} */
export async function putImage(businessId: string, folder: string, body: Buffer, mime: string) {
  const ext = ALLOWED.get(mime);
  if (!ext) throw new Error("Tipo de imagen no permitido");
  const key = `${businessId}/${folder}/${randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin().storage.from(bucketFor(key)).upload(key, body, {
    contentType: mime,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`No se pudo guardar la imagen: ${error.message}`);
  return key;
}

/**
 * URL para mostrar una imagen. Las públicas van directo al CDN de Supabase; las privadas pasan por
 * la API, que comprueba el negocio y redirige a un enlace firmado. `width` se conserva por
 * compatibilidad: la transformación de imágenes de Supabase es de pago y no se usa.
 */
export function imageUrl(key: string | null | undefined, _width = 400, _height = 0): string | null {
  if (!key) return null;
  if (PUBLIC_FOLDERS.has(folderOf(key))) {
    return `${config.supabase.url}/storage/v1/object/public/${config.supabase.publicBucket}/${key}`;
  }
  return `/api/uploads/file?key=${encodeURIComponent(key)}`;
}

/** Enlace firmado (5 min) para una imagen privada */
export async function signedPrivateUrl(key: string): Promise<string> {
  const { data, error } = await supabaseAdmin().storage.from(config.supabase.privateBucket).createSignedUrl(key, 300);
  if (error || !data) throw new Error("No se pudo generar el enlace de la imagen");
  return data.signedUrl;
}

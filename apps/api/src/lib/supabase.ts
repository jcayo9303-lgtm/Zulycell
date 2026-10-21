import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config.js";
import { HttpError } from "./errors.js";

// Las sesiones de Supabase Auth se firman con claves asimétricas (ES256) publicadas en el JWKS:
// se verifican localmente, sin llamar a Supabase en cada petición.
const jwks = createRemoteJWKSet(new URL(`${config.supabase.url}/auth/v1/.well-known/jwks.json`));

export type SupabaseIdentity = { authId: string; email: string };

export async function verifyAccessToken(token: string): Promise<SupabaseIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${config.supabase.url}/auth/v1`,
      audience: "authenticated",
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!payload.sub || !email) return null;
    return { authId: payload.sub, email };
  } catch {
    return null;
  }
}

let admin: SupabaseClient | null = null;

/** Cliente con la clave secreta (Storage). Falla con un mensaje claro si no está configurada. */
export function supabaseAdmin(): SupabaseClient {
  if (!config.supabase.secretKey) {
    throw new HttpError(503, "Falta configurar SUPABASE_SECRET_KEY para subir imágenes.", "STORAGE_NOT_CONFIGURED");
  }
  admin ??= createClient(config.supabase.url, config.supabase.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

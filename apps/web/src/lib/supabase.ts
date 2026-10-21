"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { api } from "./api";

// Cliente de Supabase en el navegador: solo para autenticación (la clave publicable es pública).
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { flowType: "implicit", persistSession: true, detectSessionInUrl: true },
  });
  return client;
}

export type SessionStatus = "authenticated" | "onboarding";

/** Entrega el token de Supabase a la API, que abre la sesión del sistema (cookie HttpOnly). */
export async function exchangeSession(accessToken: string) {
  return api.post<{ status: SessionStatus; email?: string }>("/auth/session", { accessToken });
}

/** Traduce los errores de Supabase Auth al español */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Aún no confirmaste tu email. Revisa tu bandeja de entrada (y la carpeta de spam).";
  if (m.includes("user already registered")) return "Ese email ya tiene una cuenta. Inicia sesión o recupera tu contraseña.";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 8 caracteres.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  if (m.includes("expired") || m.includes("invalid") && m.includes("link")) return "El enlace venció o ya fue usado. Solicita uno nuevo.";
  if (m.includes("same password")) return "La nueva contraseña debe ser distinta a la anterior.";
  return "Algo salió mal, si nos das un poco de tiempo podrás intentarlo en unos minutos.";
}

export const appUrl = (path: string) => `${window.location.origin}${path}`;

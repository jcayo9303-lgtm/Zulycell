import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy con nonce por petición (hallazgo #1 de la auditoría: faltaba CSP).
 * Next.js aplica el nonce a sus propios scripts al leerlo de la cabecera de la petición.
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== "production";
  // Supabase: autenticación (fetch) e imágenes del bucket público
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabase}`,
    "font-src 'self'",
    `connect-src 'self' ${supabase}${isDev ? " ws: wss:" : ""}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  // En Netlify las cabeceras de netlify.toml no se aplican a las páginas que genera Next.js
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.png|logo-|manifest.webmanifest).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};

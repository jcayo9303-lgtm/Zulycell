function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  publicUrl: required("PUBLIC_URL", "http://localhost:8080"),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET", isProd ? undefined : "dev-secret-no-usar-en-produccion"),
  cookieSecure: process.env.COOKIE_SECURE === "true",
  supabase: {
    url: required("SUPABASE_URL").replace(/\/$/, ""),
    // Clave secreta (sb_secret_… o service_role): solo en el servidor, nunca en el navegador
    secretKey: process.env.SUPABASE_SECRET_KEY ?? "",
    publicBucket: process.env.STORAGE_PUBLIC_BUCKET ?? "zulycell-public",
    privateBucket: process.env.STORAGE_PRIVATE_BUCKET ?? "zulycell-private",
  },
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "Zulycell <no-reply@zulycell.local>",
  },
  whatsapp: {
    provider: (process.env.WHATSAPP_PROVIDER ?? "log") as "log" | "http",
    apiUrl: process.env.WHATSAPP_API_URL ?? "",
    apiToken: process.env.WHATSAPP_API_TOKEN ?? "",
  },
  sessionDays: 30,
};

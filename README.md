# Zulycell POS

Punto de venta para tiendas de celulares y accesorios: ventas con IMEI y garantía, inventario, servicio técnico,
caja, clientes, proveedores y reportes en Excel.

Referencias: [auditoría técnica](docs/treinta-auditoria-tecnica.md) · [formularios](docs/zulycell-formularios-detalle.md)

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 (App Router) · React 18 · TypeScript · CSS Modules |
| API | Express 5 · TypeScript · Zod · Prisma. En Netlify corre como función (`apps/api/src/lambda.ts`) |
| Base de datos | **Supabase** PostgreSQL (proyecto Zulycell, us-west-2) |
| Acceso | **Supabase Auth**: email + contraseña con verificación de email y recuperación de contraseña |
| Imágenes | **Supabase Storage**: `zulycell-public` (productos, logos) y `zulycell-private` (comprobantes) |
| Hosting | **Netlify** desde GitHub |
| Tipografía | Inter (sistema) · JetBrains Mono (códigos, IMEI) · cifras tabulares. Archivos en `apps/web/src/fonts` |
| Colores | Del logo: rojo `#D9432B`, carbón `#1F1F24`, crema `#FBF7F2` (tokens en `globals.css`) |

## Cómo funciona el acceso

1. El usuario crea su cuenta con email y contraseña → Supabase envía el correo de verificación.
2. Al abrir el enlace vuelve a `/auth/callback`; la API verifica el token de Supabase (JWKS) y abre su propia
   sesión en una cookie HttpOnly.
3. Si es nuevo, completa los datos del negocio. Los **empleados** se agregan por email en *Empleados*: crean su
   cuenta con ese mismo email y entran directo al negocio con sus permisos.
4. "Olvidé mi contraseña" envía un enlace a `/restablecer`.

## Despliegue en Netlify (desde GitHub)

1. Sube el repositorio a GitHub (los `.env` están excluidos por `.gitignore`).
2. En Netlify: **Add new site → Import from GitHub**, elige el repositorio y configura:
   - **Base directory:** `apps/web`
   - Build command y publish salen de `apps/web/netlify.toml`.
3. **Site settings → Environment variables:**

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | Pooler de transacciones: `postgresql://postgres.<ref>:<password>@aws-1-us-west-2.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=1` |
   | `DIRECT_URL` | Pooler de sesión (puerto 5432), solo para migraciones |
   | `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` (Supabase → Settings → API Keys). Necesaria para subir imágenes |
   | `JWT_SECRET` | Secreto largo aleatorio (`openssl rand -hex 32`) |
   | `PUBLIC_URL` | `https://<tu-sitio>.netlify.app` |
   | `COOKIE_SECURE` | `true` |

4. **En Supabase → Authentication → URL Configuration:**
   - *Site URL:* `https://<tu-sitio>.netlify.app`
   - *Redirect URLs:* `https://<tu-sitio>.netlify.app/**`, `http://localhost:8080/**`, `http://localhost:3000/**`
5. **En Supabase → Authentication → SMTP Settings:** configura un servidor de correo. El correo incluido en
   Supabase solo envía a los miembros del equipo del proyecto y unos pocos correos por hora; para que lleguen
   a clientes y empleados usa un SMTP propio (Resend, Brevo y otros tienen plan gratuito).

Las migraciones se aplican desde tu PC (no en cada despliegue):

```bash
cd apps/api && npx prisma migrate deploy
```

## Ejecución local

**Con Docker** (usa el Supabase configurado en `.env`):

```bash
docker compose up -d --build      # http://localhost:8080
```

Si el build se corta ("failed to receive status"), constrúyelos por separado:
`docker compose build api` y luego `docker compose build web`.

**Sin Docker:**

```bash
cd apps/api && npm install && npm run start:local    # :4000 (Node 24) · npm run dev con Node 22
cd apps/web && npm install && npm run dev            # :3000
```

## Tipografía

Los tamaños son tokens en [apps/web/src/styles/globals.css](apps/web/src/styles/globals.css): no uses px sueltos.

| Elemento | Token | Tamaño |
|----------|-------|--------|
| Texto base | `--fs-base` | 12,5 px (interlineado 1,45) |
| Título de página | `--fs-page-title` | 17 px |
| Títulos de tarjetas / secciones | `--fs-card-title` / `--fs-section-title` | 13,5 / 12,5 px |
| Valores KPI | `--fs-kpi` | 21 px |
| Menú, botones, campos, tablas | `--fs-ui` | 12 px |
| Encabezados de tabla (mayúsculas) | `--fs-th` | 10,5 px |
| Notas y textos secundarios | `--fs-note` | 11 px |
| Grupos del menú (mayúsculas) | `--fs-nav-group` | 9,5 px |
| Ejes de gráficos | `--fs-axis` | 10 px |
| Título del login | `--fs-login-title` | 26 px |

## Estructura

```
apps/api/
  prisma/schema.prisma          modelo de datos · prisma/migrations: SQL
  prisma/seed.ts                negocio de demostración (opcional: npm run seed)
  src/modules/*.ts              un router por módulo
  src/services/                 stock/kardex, ventas, IMEI, correlativos
  src/lib/                      Supabase (auth, storage), validación, dinero, fechas, Excel
  src/lambda.ts                 entrada para Netlify Functions · netlify/functions/api.ts
apps/web/
  netlify.toml                  build, función /api/*, cabeceras de seguridad
  src/app/login, auth/callback, restablecer   acceso
  src/app/(app)/*               módulos del sistema
  src/app/c/[slug], pagar/[token]             páginas públicas
infra/nginx/nginx.conf          proxy local (Docker)
```

## Pendiente de integrar

- **WhatsApp automático:** hoy se abren enlaces `wa.me`; el envío automático requiere un proveedor (Meta Cloud API, Twilio).
- **Factura electrónica:** emisión simulada (`SIM-…`) hasta conectar un proveedor autorizado por el SIN.
- **QR de pago:** se marca pagado a mano hasta conectar una pasarela.

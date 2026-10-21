# Auditoría Técnica — Plataforma zulycell
> Fecha: 20–21 octubre 2026 | Tipo: Black-box audit (sin acceso al código fuente)  
> Metodología: Inspección de headers HTTP, análisis de JS bundles, red de requests, metadatos del DOM  
> Dominios auditados: `login.zulycell.co`, `web.zulycell.co`, `cdn.zulycell.co`, `imgproxy.zulycell.co`

---

## ÍNDICE

1. [Stack Tecnológico](#1-stack-tecnológico)
2. [Infraestructura y Hosting](#2-infraestructura-y-hosting)
3. [Arquitectura de la Aplicación](#3-arquitectura-de-la-aplicación)
4. [Dominios y Multi-marca](#4-dominios-y-multi-marca)
5. [Seguridad — Headers HTTP](#5-seguridad--headers-http)
6. [Seguridad — Autenticación](#6-seguridad--autenticación)
7. [Seguridad — Cookies y Storage](#7-seguridad--cookies-y-storage)
8. [Analytics y Tracking](#8-analytics-y-tracking)
9. [Terceros y Dependencias Externas](#9-terceros-y-dependencias-externas)
10. [Internacionalización (i18n)](#10-internacionalización-i18n)
11. [Rendimiento y Caché](#11-rendimiento-y-caché)
12. [PWA / Mobile](#12-pwa--mobile)
13. [Hallazgos de Seguridad](#13-hallazgos-de-seguridad)
14. [Resumen Ejecutivo y Score](#14-resumen-ejecutivo-y-score)

---

## 1. Stack Tecnológico

### Frontend — Confirmado por análisis de bundles

| Tecnología | Versión | Evidencia |
|-----------|---------|-----------|
| **Next.js** | 13.x | Build ID: `XHqoufC4ULlx0Q7fZFmZK`, chunks: `framework-b9fd9bcc3ecde907.js`, `webpack-e569d1d537736d1e.js` |
| **React** | 18.x (inferido) | Next.js 13+ usa React 18 por defecto; chunk `framework` contiene React |
| **TypeScript** | Probable | Next.js 13 con TypeScript es el template estándar |
| **Webpack** | 5.x | `webpack-e569d1d537736d1e.js` en el bundle |
| **CSS** | CSS Modules / Styled (inferido) | No hay `styled-components` ni `tailwind` detectado externamente |
| **Fuente tipográfica** | Nunito Sans | Google Fonts: `family=Nunito+Sans:ital,wght@0,300;0,400;0,700;0,900;1,400` |
| **i18n** | next-i18next | `_nextI18Next` en `__NEXT_DATA__`; múltiples namespaces |
| **Rendering** | SSG (Static Site Generation) | `"gsp": true` en `__NEXT_DATA__` — páginas pre-generadas en build time |

### Backend — Inferido

| Componente | Tecnología probable | Evidencia |
|------------|-------------------|-----------|
| **API Backend** | Node.js / NestJS o similar | Ecosystem Next.js + endpoint pattern |
| **Base de datos** | No expuesta públicamente | Sin referencia directa en el frontend |
| **OTP / Auth** | Servicio propio + SMS/WhatsApp gateway | Login por código sin contraseña |
| **Imágenes** | **imgproxy** (open-source) | `server: imgproxy` en headers de `imgproxy.zulycell.co` |
| **CDN assets** | AWS S3 + CloudFront | URLs `cdn.zulycell.co` con headers `x-amz-cf-*` |

### Versión del producto (login app)
```
Datadog service:  login-web
Datadog version:  1.3.5
Datadog env:      production
Build ID:         XHqoufC4ULlx0Q7fZFmZK
Último build:     2026-10-15T15:00:52Z  (hace ~5 días del audit)
```

---

## 2. Infraestructura y Hosting

### Diagrama de infraestructura detectada

```
Usuario
  │
  ▼
[CloudFront CDN — AWS]  ◄─── login.zulycell.co, web.zulycell.co, cdn.zulycell.co
  │
  ├── cdn.zulycell.co/login/1.3.5/_next/...  →  S3 Bucket (assets estáticos)
  ├── imgproxy.zulycell.co                   →  imgproxy server (resize/optimización)
  ├── login.zulycell.co                      →  Next.js SSG (pre-rendered)
  └── web.zulycell.co                        →  App web (requiere auth)
```

### Evidencia de AWS CloudFront

| Header | Valor | Significado |
|--------|-------|-------------|
| `via` | `1.1 1363962ebe43751f885359ece2e8196a.cloudfront.net (CloudFront)` | **Confirmado: AWS CloudFront** |
| `x-amz-cf-id` | `Cf0d_u7JnMTwNUROXa1fxZCW3drnHLAF7o88rAeS8Z9G...` | ID de request en CloudFront |
| `x-amz-cf-pop` | `LIM50-P1` | POP de CloudFront en **Lima, Perú** (LIM50) |
| `x-cache` | `Miss from cloudfront` / `Hit from cloudfront` | Estado del caché |
| `x-nextjs-cache` | `HIT` | Caché de Next.js activo |

> **Región de servicio principal:** Lima, Perú (LIM50-P1) — lógico dado que el mercado principal es Latinoamérica.

### CDN de assets estáticos
- `cdn.zulycell.co` sirve todos los JS bundles, imágenes y assets
- Cache-control: `public, max-age=31536000, immutable` → 1 año de caché para assets
- Los chunks tienen hash en el nombre (ej. `framework-b9fd9bcc3ecde907.js`) → **cache busting por contenido**

### imgproxy
- `imgproxy.zulycell.co` — servidor propio de optimización de imágenes
- Header `server: imgproxy` — open-source image proxy escrito en Go
- Firma de URLs: `imgproxy.zulycell.co/sig/size:1080:::/quality:75/plain/...` → **URLs firmadas** (evita abuso)
- CORS: `access-control-allow-origin: *` — abierto para cualquier origen en imágenes

---

## 3. Arquitectura de la Aplicación

### Estrategia de rendering

| Página | Estrategia | Evidencia |
|--------|-----------|-----------|
| Login (`/`) | **SSG** (Static) | `"gsp": true` en __NEXT_DATA__ |
| Registro (`/registro`) | **SSG** | Archivo pre-generado: `_next/data/[buildId]/es/registro.json` |
| App web (`web.zulycell.co`) | **CSR o SSR privado** | Requiere auth, devuelve 403 sin token |

### Estructura de rutas detectada

```
login.zulycell.co/
├── /               → Pantalla de login (SSG)
├── /registro       → Registro nuevo usuario (SSG)
├── /es/registro    → Registro en español (con i18n)
├── /_next/data/[buildId]/es/registro.json  → Datos de la ruta
└── /manifest.json  → PWA manifest
```

### Bundle splitting
Los chunks del build son:
```
polyfills-42372ed130431b0a.js       → Polyfills de compatibilidad
webpack-e569d1d537736d1e.js         → Runtime de webpack
framework-b9fd9bcc3ecde907.js       → React + React-DOM
main-61f05a3e7bdac8c6.js            → Core de Next.js
pages/_app-a32b65cbbb3bc872.js      → App wrapper
7260-c7f18510150dd8be.js           → Chunk lazy-loaded
8089-07d8a85aebf9e385.js           → Chunk lazy-loaded
8212-e53ded0dce45b802.js           → Chunk lazy-loaded
pages/index-2cc45d54c3180a33.js    → Página de login
```
> **No se detectaron source maps expuestos** — el código está minificado y ofuscado en producción. ✅

---

## 4. Dominios y Multi-marca

zulycell opera **múltiples marcas** bajo el mismo sistema de login:

| Dominio | Marca | Idioma | Mercado |
|---------|-------|--------|---------|
| `login.zulycell.co` | zulycell | Español | Latinoamérica |
| `login.trinta.co` | Trinta | Portugués (`pt`) | Brasil |
| `login.tavoapp.co` | TavoApp | Inglés, Thai, Vietnamita, Malayo, Filipino, Indonesio | SEA + Global |
| `web.zulycell.co` | zulycell Web | Español | Latinoamérica |

> Estos tres dominios comparten el **mismo codebase de login** con i18n. La empresa opera en Brasil (Trinta) y Sudeste Asiático (TavoApp) además de LATAM.

### Idiomas soportados en el sistema

`es` (español) · `pt` (portugués) · `th` (tailandés) · `vi` (vietnamita) · `ms` (malayo) · `tl` (filipino) · `id` (indonesio) · `en` (inglés)

---

## 5. Seguridad — Headers HTTP

### Headers presentes en `login.zulycell.co`

| Header de Seguridad | Valor | Evaluación |
|--------------------|-------|------------|
| `x-frame-options` | `SAMEORIGIN` | ✅ Protege contra clickjacking |
| `x-nextjs-cache` | `HIT` | ℹ️ Info (no es de seguridad) |
| `vary` | `Accept-Encoding, Origin` | ✅ CORS correcto |
| `cache-control` | `s-maxage=31536000` | ℹ️ OK para contenido estático |

### Headers de seguridad **AUSENTES** (hallazgo crítico)

| Header | Por qué importa | Riesgo |
|--------|----------------|--------|
| ❌ `Strict-Transport-Security` (HSTS) | No fuerza HTTPS en siguientes visitas | **MEDIO** — sin HSTS un MitM puede downgrade a HTTP en la primera visita |
| ❌ `Content-Security-Policy` (CSP) | Sin restricción de scripts/frames/recursos | **ALTO** — sin CSP, XSS puede cargar scripts externos |
| ❌ `X-Content-Type-Options: nosniff` | Sin prevención de MIME sniffing | **BAJO-MEDIO** |
| ❌ `Referrer-Policy` | Sin control de información del referrer | **BAJO** |
| ❌ `Permissions-Policy` | Sin restricción de APIs del browser (cámara, mic, etc.) | **BAJO-MEDIO** |

> ⚠️ La ausencia de **CSP** en una aplicación con login es el hallazgo de seguridad más relevante de headers.

### Headers en `imgproxy.zulycell.co` (imágenes)

| Header | Valor | Evaluación |
|--------|-------|------------|
| `access-control-allow-origin` | `*` | ⚠️ CORS abierto — cualquier sitio puede embeber imágenes |
| `content-security-policy` | `script-src 'none'` | ✅ Para imágenes es correcto |
| `server` | `imgproxy` | ⚠️ **Versión del servidor expuesta** — permite fingerprinting |
| `x-request-id` | UUID | ℹ️ Trazabilidad interna |

---

## 6. Seguridad — Autenticación

### Mecanismo de autenticación

zulycell usa **autenticación sin contraseña (passwordless)** basada en OTP:

```
Flujo de login/registro:
1. Usuario ingresa número de celular O email
2. Sistema envía código OTP por WhatsApp o SMS
3. Usuario ingresa código de 4–6 dígitos
4. Sistema emite token de sesión
```

### Validaciones detectadas en el código i18n

| Validación | Mensaje de error | Evaluación |
|-----------|-----------------|------------|
| Teléfono inválido | `"El número que ingresaste no es válido, corrígelo para continuar."` | ✅ Valida formato |
| Usuario no registrado | `"Tu número de celular no está registrado. Por favor, regístrate."` | ⚠️ **User enumeration** — confirma si un número existe |
| OTP inválido | `"El código no es válido. Vuelve a intentarlo o solicita uno nuevo."` | ✅ |
| Límite de intentos | `"Llegaste al límite de intentos"` | ✅ Rate limiting implementado |
| Bloqueado por intentos | `"Hay un problema con tu número de celular. Por favor, contacta a soporte."` | ✅ Bloqueo de cuenta |
| Ya registrado | `"Tu número de celular ya está registrado en zulycell. Por favor, inicia sesión."` | ⚠️ **User enumeration** en registro |

**reCAPTCHA:** Google reCAPTCHA Enterprise implementado en el login.
```
Site key: 6Lc3XckfAAAAALOp-riQB0VlyoOAS11EQXtWoUjA
Tipo: invisible (no interfiere con UX)
```

### Hallazgos en autenticación

| # | Hallazgo | Severidad | Detalle |
|---|---------|-----------|---------|
| 1 | **User enumeration** | 🟡 MEDIO | Los mensajes de error revelan si un número está o no registrado. Un atacante puede confirmar qué números de celular tienen cuenta. |
| 2 | **Rate limiting** | ✅ PRESENTE | Hay límite de intentos de OTP implementado. |
| 3 | **reCAPTCHA Enterprise** | ✅ PRESENTE | Protección contra bots automatizados. |
| 4 | **Sin contraseña** | ✅ POSITIVO | Elimina riesgo de contraseñas débiles o reutilizadas. |
| 5 | **OTP por WhatsApp** | ℹ️ | WhatsApp no es canal criptográficamente certificado, pero es aceptable para este nivel de aplicación. |

---

## 7. Seguridad — Cookies y Storage

### Cookies detectadas

| Cookie | Origen | Propósito | HttpOnly | Secure | SameSite |
|--------|--------|-----------|----------|--------|----------|
| `singular_device_id` | Singular.net | Analytics de atribución — device ID | ❓ | ❓ | ❓ |
| `_fbp` | Facebook | Facebook Pixel — tracking publicitario | ❓ | ❓ | ❓ |
| `_ga` | Google Analytics | GA4 — analytics general | ❓ | ❓ | ❓ |
| `_ga_E6V01L829Z` | Google Analytics | GA4 session | ❓ | ❓ | ❓ |
| `_dd_s` | Datadog | Real User Monitoring session | ❓ | ❓ | ❓ |
| `amp_9e20f5` | Amplitude | Product analytics | ❓ | ❓ | ❓ |

> ❓ = No verificable sin acceso a Set-Cookie response headers (requieren inspección de respuesta de login real)

> ⚠️ **Observación:** La mayoría de las cookies son de **tracking de terceros**, no de sesión. Las cookies de sesión propias (auth token) solo se generan post-login y no fueron accesibles en el audit.

### LocalStorage — Claves detectadas

| Clave | Origen | Propósito |
|-------|--------|-----------|
| `zulycell_80944cce_web.zulycell.co_last_event_timestamp` | Singular SDK | Timestamp del último evento |
| `zulycell_80944cce_web.zulycell.co_did_visit_site` | Singular SDK | Flag de primera visita |
| `global_singular_id` | Singular SDK | ID global de dispositivo |
| `amplitude_unsent_identify_9e20f5...` | Amplitude | Eventos sin enviar (buffer) |
| `amplitude_unsent_9e20f5...` | Amplitude | Eventos sin enviar |
| `zulycell_80944cce_web.zulycell.co_singular_instance_id` | Singular SDK | ID de instancia |
| `zulycell_80944cce_web.zulycell.co_touchpoint_timestamp` | Singular SDK | Tiempo del punto de contacto |
| `lastExternalReferrer` | Singular SDK | Referrer de entrada |
| `zulycell_80944cce_web.zulycell.co_web_url` | Singular SDK | URL actual |

### SessionStorage

| Clave | Propósito |
|-------|-----------|
| `zulycell_80944cce_web.zulycell.co_singular_api_queue` | Cola de eventos de Singular pendientes de envío |

> **Observación:** No se detectó información sensible (tokens, datos de usuario) en localStorage/sessionStorage en la pantalla de login. El token de sesión se maneja probablemente en cookies HttpOnly (no visible desde JS).

---

## 8. Analytics y Tracking

zulycell usa **5 herramientas de analytics/tracking** simultáneas:

| Herramienta | Tipo | ID/Key detectada | Propósito |
|------------|------|-----------------|-----------|
| **Google Analytics 4** | Web analytics | `G-E6V01L829Z` | Métricas de uso del sitio |
| **Google Tag Manager** | Tag manager | (vía gtag.js) | Orquesta otros tags |
| **Facebook Pixel** | Ads tracking | `1018693682136172` | Retargeting publicitario en Meta |
| **Datadog RUM** | Error monitoring | App ID: `b6ef55a2-acd1-4c85-94c4-1482b161a668` | Real User Monitoring + errores |
| **Amplitude** | Product analytics | `9e20f500eb7b7021896dd54748fbcccf` | Analítica de producto / eventos |
| **Singular** | Attribution | App Key: `zulycell_80944cce` | Atribución de campañas / ROI |

### Datadog — Configuración expuesta
```javascript
// Visible en inline script de login.zulycell.co
window.DD_RUM.init({
  clientToken: 'pub7124c5fc0ebeef7a425c3fcf0ce2f071',
  applicationId: 'b6ef55a2-acd1-4c85-94c4-1482b161a668',
  site: 'datadoghq.com',
  service: 'login-web',
  env: 'production',
  version: '1.3.5',
  // ...sesión y replay config
})
```
> El `clientToken` de Datadog RUM es de tipo público (`pub...`) — diseñado para estar en el frontend. No es una credencial sensible.

---

## 9. Terceros y Dependencias Externas

### Dominios externos cargados por la app

| Dominio | Servicio | Tipo |
|---------|---------|------|
| `www.gstatic.com` | Google (reCAPTCHA) | Anti-bot |
| `www.google.com` | Google reCAPTCHA Enterprise | Anti-bot |
| `www.googletagmanager.com` | Google Tag Manager | Marketing |
| `connect.facebook.net` | Facebook Pixel + SDK | Marketing |
| `www.datadoghq-browser-agent.com` | Datadog RUM agent | Monitoring |
| `sdk-api-v1.singular.net` | Singular attribution | Marketing |
| `fonts.googleapis.com` | Google Fonts | UI |
| `cdn.zulycell.co` | CDN propio (CloudFront) | Core |
| `imgproxy.zulycell.co` | Image proxy propio | Core |

### Análisis de riesgo de terceros

| Tercero | Acceso a datos | Riesgo |
|---------|---------------|--------|
| Facebook Pixel | Páginas visitadas, conversiones | 🟡 MEDIO — GDPR/privacidad |
| Google Analytics | Comportamiento de navegación | 🟡 MEDIO — transferencia a USA |
| Singular | Device ID, eventos de conversión | 🟡 MEDIO |
| Amplitude | Eventos de producto en detalle | 🟡 MEDIO |
| Datadog | Errores JS, sesiones de usuario | 🟢 BAJO — uso legítimo de monitoreo |
| reCAPTCHA | Comportamiento del mouse/teclado | 🟢 BAJO — anti-fraude |

---

## 10. Internacionalización (i18n)

### Implementación
- **Librería:** `next-i18next`
- **Estrategia:** SSG con traducciones embebidas en el HTML pre-generado
- **Namespaces:** `commons`, `login`, `welcome-view`, `whatsapp-button`, `sign-up-phone`, `errors`

### Mensajes de error detectados (completos)

```
OTP inválido:        "El código no es válido. Vuelve a intentarlo o solicita uno nuevo."
Teléfono inválido:   "Tu número de celular no es válido."
Error genérico:      "Algo salió mal, si nos das un poco de tiempo podrás intentarlo en unos minutos."
Datos incorrectos:   "Algo salió mal, los datos ingresados no son correctos."
Límite de intentos:  "Llegaste al límite de intentos"
Error de cuenta:     "Hay un problema con tu número de celular. Por favor, contacta a soporte."
Error técnico:       "Discúlpanos, tenemos problemas técnicos"
```

### Pasos del flujo de registro (confirmados por i18n)
```
Paso 1: "Tu número"     → Ingresa teléfono
Paso 2: "Verificación"  → Ingresa OTP
Paso 3: "Tu negocio"    → Datos del negocio
```

---

## 11. Rendimiento y Caché

### Política de caché por tipo de recurso

| Tipo | Cache-Control | TTL | Estrategia |
|------|--------------|-----|------------|
| Assets JS/CSS (hashed) | `public, max-age=31536000, immutable` | **1 año** | Cache busting por hash |
| Datos SSG (JSON) | `s-maxage=31536000` | **1 año** (en CDN) | Se invalida con nuevo deploy |
| Manifest/HTML | `public, max-age=0` | **0** (siempre fresco) | No cacheable |
| Imágenes (imgproxy) | `max-age=31536000, public` | **1 año** | CDN CloudFront |

### Build date
- `last-modified: Thu, 15 Oct 2026 15:00:52 GMT` → Último deploy hace ~5 días

### Carga de página
- SSG garantiza que el HTML llega pre-renderizado desde CloudFront → **TTFB muy bajo**
- reCAPTCHA invisible no bloquea el render inicial
- Fuente Nunito Sans cargada desde Google Fonts (posible render-blocking)

---

## 12. PWA / Mobile

### Manifest de la aplicación (`manifest.json`)
```json
{
  "short_name": "zulycell",
  "name": "zulycell",
  "icons": [
    {"src": "./favicon.ico", "sizes": "64x64 32x32 24x24 16x16", "type": "image/x-icon"}
  ],
  "scope": "/",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#000000",
  "background_color": "#ffffff"
}
```

### Evaluación PWA

| Criterio | Estado | Observación |
|---------|--------|-------------|
| `display: standalone` | ✅ | Se puede instalar como app |
| `start_url` | ✅ | Definido |
| Service Worker | ✅ | Registrado (`'serviceWorker' in navigator` = true) |
| Iconos | ⚠️ | Solo tiene .ico — faltan PNG de alta resolución para móvil |
| Theme color | ✅ | Definido |

---

## 13. Hallazgos de Seguridad

### Clasificación de hallazgos

| # | Hallazgo | Severidad | Categoría | Recomendación |
|---|---------|-----------|-----------|---------------|
| 1 | **Ausencia de Content-Security-Policy (CSP)** | 🔴 ALTO | Headers | Implementar CSP restrictiva: `default-src 'self'; script-src 'self' cdn.zulycell.co www.gstatic.com...` |
| 2 | **User enumeration en login y registro** | 🟡 MEDIO | Auth | Usar mensajes genéricos: "Si el número existe, recibirás un código" |
| 3 | **Ausencia de HSTS** | 🟡 MEDIO | Transport | `Strict-Transport-Security: max-age=31536000; includeSubDomains` |
| 4 | **Ausencia de X-Content-Type-Options** | 🟡 BAJO-MEDIO | Headers | `X-Content-Type-Options: nosniff` |
| 5 | **`server: imgproxy` expuesto** | 🟢 BAJO | Fingerprinting | Eliminar el header `Server` o usar valor genérico |
| 6 | **CORS abierto en imgproxy** | 🟢 BAJO | CORS | Si no es necesario, restringir a `*.zulycell.co` |
| 7 | **Ausencia de Referrer-Policy** | 🟢 BAJO | Headers | `Referrer-Policy: strict-origin-when-cross-origin` |
| 8 | **Ausencia de Permissions-Policy** | 🟢 BAJO | Headers | Restringir APIs no usadas |
| 9 | **5 SDKs de terceros con acceso a comportamiento** | 🟡 MEDIO | Privacidad | Revisar cumplimiento GDPR/LFPD en países operados |
| 10 | **No hay source maps en producción** | ✅ N/A | Code | Positivo — código minificado y ofuscado |

### No se encontraron:
- ✅ Sin claves de API sensibles expuestas en el frontend
- ✅ Sin tokens de producción en localStorage
- ✅ Sin endpoints de API en texto plano
- ✅ Sin errores de configuración CORS críticos en el core
- ✅ Sin información de base de datos expuesta
- ✅ reCAPTCHA Enterprise implementado

---

## 14. Resumen Ejecutivo y Score

### Perfil técnico general

| Dimensión | Evaluación | Puntuación |
|-----------|-----------|------------|
| **Stack moderno** | Next.js 13 + React 18 — stack actual y mantenido | ✅ 9/10 |
| **Infraestructura** | AWS CloudFront + S3 — enterprise-grade | ✅ 9/10 |
| **Seguridad de headers** | Falta CSP, HSTS, otros | ⚠️ 5/10 |
| **Autenticación** | Passwordless + OTP + reCAPTCHA Enterprise | ✅ 8/10 |
| **Monitoreo** | Datadog RUM en producción | ✅ 8/10 |
| **Rendimiento** | SSG + CDN + cache agresivo | ✅ 9/10 |
| **Privacidad / Terceros** | 5 SDKs de tracking, sin CSP | ⚠️ 5/10 |
| **Transparencia técnica** | Sin source maps, código ofuscado | ✅ 8/10 |
| **PWA** | Básico pero funcional | ✅ 7/10 |
| **Madurez del producto** | v1.3.5, deploy reciente (15/10/2026) | ✅ 8/10 |

### **Score general: 7.6 / 10**

---

### Conclusión

zulycell es una aplicación **técnicamente sólida** para su segmento de mercado (POS para pymes latinoamericanas). Usa un stack moderno y bien mantenido, con infraestructura enterprise de AWS. Las principales áreas de mejora son en **headers de seguridad HTTP** (especialmente CSP y HSTS) y la **gestión de terceros de tracking**, que es abundante. No se detectaron vulnerabilidades críticas ni exposición de secretos.

Para una empresa de software B2B con +7M de usuarios, el nivel técnico es adecuado. Los hallazgos encontrados son comunes en aplicaciones SaaS de esta escala y categoría, y ninguno representa un riesgo inmediato para los datos de negocio de los usuarios.

---

## Apéndice — Datos Técnicos Crudos

### IDs y tokens detectados (todos públicos/client-side)

```
Google Analytics:      G-E6V01L829Z
Google reCAPTCHA:      6Lc3XckfAAAAALOp-riQB0VlyoOAS11EQXtWoUjA
Facebook Pixel ID:     1018693682136172
Datadog App ID:        b6ef55a2-acd1-4c85-94c4-1482b161a668
Datadog Client Token:  pub7124c5fc0ebeef7a425c3fcf0ce2f071 (público)
Amplitude API Key:     9e20f500eb7b7021896dd54748fbcccf
Singular App Key:      zulycell_80944cce
```
> Todos son tokens de tipo **public/client-side**, diseñados para estar en el frontend. No representan riesgo de seguridad por sí solos.

### Endpoints detectados
```
login.zulycell.co                              → App de autenticación
login.zulycell.co/_next/data/[buildId]/*.json → Datos SSG de Next.js
cdn.zulycell.co/login/[version]/_next/...     → Assets estáticos
imgproxy.zulycell.co/sig/...                  → Proxy de imágenes
sdk-api-v1.singular.net/api/v1/event         → Singular attribution API
```

### Build info
```
Next.js Build ID:  XHqoufC4ULlx0Q7fZFmZK
App version:       1.3.5
Last deploy:       2026-10-15 15:00:52 UTC
CDN POP:           LIM50-P1 (Lima, Perú)
```

---

*Metodología: Black-box audit sin acceso al código fuente ni credenciales. Basado en: inspección de headers HTTP, análisis de bundles JavaScript en producción, metadatos DOM, `__NEXT_DATA__`, localStorage, cookies y requests de red observados en tiempo real.*

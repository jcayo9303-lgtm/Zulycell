// Cliente HTTP del frontend. Todas las rutas van a /api (mismo origen, cookie HttpOnly).

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query?: Query) {
  const url = `/api${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(buildUrl(path, query), {
    method,
    credentials: "same-origin",
    headers: body && !isForm ? { "content-type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });

  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    window.location.href = "/login";
    throw new ApiError(401, "Tu sesión expiró.");
  }

  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error ?? "Algo salió mal, si nos das un poco de tiempo podrás intentarlo en unos minutos.",
      data?.code,
      data?.fields,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path),
  /** URL para descargas directas (CSV, plantillas Excel) */
  url: (path: string, query?: Query) => buildUrl(path, query),
};

export async function uploadImage(file: File, folder: "products" | "logos" | "banners" | "expenses" | "purchases") {
  const form = new FormData();
  form.append("file", file);
  return request<{ key: string; url: string }>("POST", `/uploads?folder=${folder}`, form);
}

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };

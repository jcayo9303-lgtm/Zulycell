"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import s from "./login.module.css";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { BUSINESS_TYPES, options } from "@/lib/labels";
import { appUrl, authErrorMessage, exchangeSession, supabase } from "@/lib/supabase";

type Step = "login" | "register" | "check-email" | "forgot" | "forgot-sent" | "business";
type Country = { code: string; name: string; currency: string };

const MIN_PASSWORD = 8;

function LoginForm() {
  const params = useSearchParams();
  const [step, setStep] = useState<Step>(params.get("registro") ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(params.get("error"));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [business, setBusiness] = useState({ businessName: "", country: "BO", type: "CELULARES", ownerName: "", phone: "" });

  // Si se recarga a mitad del registro del negocio, retomamos ese paso
  useEffect(() => {
    api
      .get<{ pending: boolean; email: string | null }>("/auth/signup-state")
      .then((r) => {
        if (r.pending) {
          setEmail(r.email ?? "");
          setStep("business");
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (step === "business" && !countries.length) api.get<Country[]>("/meta/countries").then(setCountries);
  }, [step, countries.length]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields ?? {});
      } else setError(e instanceof Error ? authErrorMessage(e.message) : "Algo salió mal.");
    } finally {
      setBusy(false);
    }
  }

  const afterAuth = async (accessToken: string) => {
    const r = await exchangeSession(accessToken);
    if (r.status === "authenticated") window.location.href = "/balance";
    else setStep("business");
  };

  const submitLogin = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { data, error: err } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      await afterAuth(data.session!.access_token);
    });
  };

  const submitRegister = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setFields({ password: `Mínimo ${MIN_PASSWORD} caracteres` });
    if (password !== password2) return setFields({ password2: "Las contraseñas no coinciden" });
    void run(async () => {
      const { data, error: err } = await supabase().auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: appUrl("/auth/callback") },
      });
      if (err) throw err;
      // Con la verificación de email activada Supabase no devuelve sesión hasta confirmar
      if (data.session) await afterAuth(data.session.access_token);
      else setStep("check-email");
    });
  };

  const resend = () =>
    run(async () => {
      const { error: err } = await supabase().auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: appUrl("/auth/callback") },
      });
      if (err) throw err;
      setError(null);
    });

  const submitForgot = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error: err } = await supabase().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: appUrl("/restablecer"),
      });
      if (err) throw err;
      setStep("forgot-sent");
    });
  };

  const submitBusiness = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.post("/auth/signup", business);
      window.location.href = "/balance";
    });
  };

  const go = (next: Step) => {
    setError(null);
    setFields({});
    setStep(next);
  };

  return (
    <div className={s.box}>
      {step === "login" && (
        <form className="stack" onSubmit={submitLogin}>
          <div>
            <h1 className={s.title}>Ingresa a Zulycell</h1>
            <p className={s.subtitle}>Usa el email y la contraseña de tu cuenta.</p>
          </div>
          <Field label="Email" required>
            <Input autoFocus type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Contraseña" required>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!email.trim() || !password}>
            Ingresar
          </Button>
          <div className="row-between">
            <Button variant="ghost" size="sm" onClick={() => go("forgot")}>
              Olvidé mi contraseña
            </Button>
            <Button variant="ghost" size="sm" onClick={() => go("register")}>
              Crear una cuenta
            </Button>
          </div>
        </form>
      )}

      {step === "register" && (
        <form className="stack" onSubmit={submitRegister}>
          <div>
            <h1 className={s.title}>Crea tu cuenta</h1>
            <p className={s.subtitle}>Te enviaremos un correo para verificar tu email.</p>
          </div>
          <Field label="Email" required>
            <Input autoFocus type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Contraseña" required hint={`Mínimo ${MIN_PASSWORD} caracteres`} error={fields.password}>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Repite la contraseña" required error={fields.password2}>
            <Input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!email.trim() || !password || !password2}>
            Crear cuenta
          </Button>
          <Button variant="ghost" size="sm" onClick={() => go("login")}>
            Ya tengo cuenta: ingresar
          </Button>
        </form>
      )}

      {step === "check-email" && (
        <div className="stack">
          <div>
            <h1 className={s.title}>Revisa tu correo</h1>
            <p className={s.subtitle}>
              Enviamos un enlace de verificación a <strong>{email}</strong>. Ábrelo para activar tu cuenta. Si no lo ves,
              revisa la carpeta de spam.
            </p>
          </div>
          {error && <Alert>{error}</Alert>}
          <Button loading={busy} onClick={resend}>
            Reenviar correo
          </Button>
          <Button variant="ghost" size="sm" onClick={() => go("login")}>
            Volver a ingresar
          </Button>
        </div>
      )}

      {step === "forgot" && (
        <form className="stack" onSubmit={submitForgot}>
          <div>
            <h1 className={s.title}>Recupera tu contraseña</h1>
            <p className={s.subtitle}>Te enviaremos un enlace para crear una nueva.</p>
          </div>
          <Field label="Email" required>
            <Input autoFocus type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!email.trim()}>
            Enviar enlace
          </Button>
          <Button variant="ghost" size="sm" onClick={() => go("login")}>
            Volver
          </Button>
        </form>
      )}

      {step === "forgot-sent" && (
        <div className="stack">
          <div>
            <h1 className={s.title}>Revisa tu correo</h1>
            <p className={s.subtitle}>
              Si <strong>{email}</strong> tiene una cuenta, te llegará un enlace para crear una nueva contraseña.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => go("login")}>
            Volver a ingresar
          </Button>
        </div>
      )}

      {step === "business" && (
        <form className="stack" onSubmit={submitBusiness}>
          <div>
            <h1 className={s.title}>Cuéntanos de tu negocio</h1>
            <p className={s.subtitle}>
              {email ? <>Cuenta verificada: {email}. </> : null}Con esto configuramos tu moneda y tus reportes.
            </p>
          </div>
          <Field label="Nombre del negocio" required error={fields.businessName}>
            <Input autoFocus maxLength={100} value={business.businessName} onChange={(e) => setBusiness({ ...business, businessName: e.target.value })} />
          </Field>
          <div className="grid-2">
            <Field label="País" required error={fields.country}>
              <Select
                value={business.country}
                onChange={(e) => setBusiness({ ...business, country: e.target.value })}
                options={countries.map((c) => ({ value: c.code, label: `${c.name} (${c.currency})` }))}
              />
            </Field>
            <Field label="Tipo de negocio" required error={fields.type}>
              <Select value={business.type} onChange={(e) => setBusiness({ ...business, type: e.target.value })} options={options(BUSINESS_TYPES)} />
            </Field>
          </div>
          <Field label="Tu nombre" required error={fields.ownerName}>
            <Input maxLength={100} autoComplete="name" value={business.ownerName} onChange={(e) => setBusiness({ ...business, ownerName: e.target.value })} />
          </Field>
          <Field label="Celular / WhatsApp" hint="Opcional" error={fields.phone}>
            <Input inputMode="tel" maxLength={20} value={business.phone} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!business.businessName.trim() || !business.ownerName.trim()}>
            Continuar
          </Button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className={s.page}>
      <aside className={s.aside}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-icon-192.png" alt="" className={s.asideLogo} />
        <div>
          <div className={s.asideTitle}>Vende, controla tu inventario y lleva las cuentas de tu negocio.</div>
          <ul className={s.asideList}>
            <li>Punto de venta con IMEI y garantías</li>
            <li>Servicio técnico: órdenes de reparación</li>
            <li>Inventario de accesorios, repuestos y celulares</li>
            <li>Cierre de caja, ingresos y reportes en Excel</li>
          </ul>
        </div>
        <div className="note">Zulycell · Venta al por mayor</div>
      </aside>

      <div className={s.panel}>
        <div className={s.panelInner}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-horizontal.png" alt="Zulycell" className={s.brand} />
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

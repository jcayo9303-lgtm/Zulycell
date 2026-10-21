"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { authErrorMessage, exchangeSession, supabase } from "@/lib/supabase";

// Destino del enlace "Olvidé mi contraseña": Supabase abre una sesión de recuperación en la URL
export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => (data.session ? setReady(true) : setError(authErrorMessage("expired link"))));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== password2) return setError("Las contraseñas no coinciden.");
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase().auth.updateUser({ password });
      if (err) throw err;
      const { data: s } = await supabase().auth.getSession();
      const r = await exchangeSession(s.session!.access_token);
      window.location.replace(r.status === "authenticated" ? "/balance" : "/login");
    } catch (err) {
      setError(authErrorMessage(err instanceof Error ? err.message : ""));
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form className="stack" style={{ maxWidth: 360, width: "100%" }} onSubmit={submit}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-horizontal.png" alt="Zulycell" style={{ width: 180 }} />
        <h1 className="page-title">Crea una nueva contraseña</h1>
        <Field label="Nueva contraseña" required hint="Mínimo 8 caracteres">
          <Input type="password" autoComplete="new-password" disabled={!ready} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Repite la contraseña" required>
          <Input type="password" autoComplete="new-password" disabled={!ready} value={password2} onChange={(e) => setPassword2(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!ready || !password || !password2}>
          Guardar contraseña
        </Button>
        <Button variant="ghost" size="sm" onClick={() => (window.location.href = "/login")}>
          Volver a ingresar
        </Button>
      </form>
    </div>
  );
}

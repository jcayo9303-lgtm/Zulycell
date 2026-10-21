"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { authErrorMessage, exchangeSession, supabase } from "@/lib/supabase";

// Destino del enlace de verificación de email: Supabase deja la sesión en la URL (#access_token=…)
export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const urlError = hash.get("error_description") ?? new URLSearchParams(window.location.search).get("error_description");
    if (urlError) {
      setError(authErrorMessage(urlError));
      return;
    }
    const finish = async () => {
      const { data } = await supabase().auth.getSession();
      if (!data.session) throw new Error("expired link");
      const r = await exchangeSession(data.session.access_token);
      window.location.replace(r.status === "authenticated" ? "/balance" : "/login");
    };
    finish().catch((e) => setError(authErrorMessage(e instanceof Error ? e.message : "")));
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="stack" style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
        {error ? (
          <>
            <Alert>{error}</Alert>
            <Button variant="primary" onClick={() => (window.location.href = "/login")}>
              Ir a ingresar
            </Button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Spinner />
            </div>
            <p className="muted">Verificando tu cuenta…</p>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";

// Si Supabase redirige a la raíz con la sesión en la URL (#access_token / ?code), se completa el acceso.
export default function Home() {
  useEffect(() => {
    const { hash, search } = window.location;
    if (/access_token|error_description/.test(hash) || /error_description/.test(search)) {
      const recovery = hash.includes("type=recovery");
      window.location.replace(`${recovery ? "/restablecer" : "/auth/callback"}${search}${hash}`);
    } else {
      window.location.replace("/balance");
    }
  }, []);
  return null;
}

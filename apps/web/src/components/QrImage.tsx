"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download } from "lucide-react";
import { Button } from "./ui";

/** Código QR generado en el navegador; opcionalmente con botón para descargar el PNG. */
export function QrImage({ value, size = 200, downloadName }: { value: string; size?: number; downloadName?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ width: size, height: size, background: "#fff", display: "grid", placeItems: "center" }}>
        {src && <img src={src} width={size} height={size} alt="Código QR" />}
      </div>
      {downloadName && src && (
        <Button
          size="sm"
          className="no-print"
          icon={<Download size={14} />}
          onClick={() => {
            const a = document.createElement("a");
            a.href = src;
            a.download = `${downloadName}.png`;
            a.click();
          }}
        >
          Descargar PNG
        </Button>
      )}
    </div>
  );
}

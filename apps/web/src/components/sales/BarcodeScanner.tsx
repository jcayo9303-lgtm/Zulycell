"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Modal } from "@/components/ui";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/** Escáner por cámara con la API BarcodeDetector del navegador (Chrome/Edge/Android). */
export function BarcodeScanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Ctor) {
      setError("Este navegador no permite leer códigos con la cámara. Usa un lector USB/Bluetooth o escribe el código en el buscador.");
      return;
    }

    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const detector = new Ctor({ formats: ["ean_13", "upc_a", "ean_8", "code_128"] });

    const scan = async () => {
      if (stopped || !videoRef.current) return;
      try {
        const found = await detector.detect(videoRef.current);
        if (found[0]?.rawValue) {
          onDetected(found[0].rawValue);
          return;
        }
      } catch {
        /* cuadro sin imagen todavía */
      }
      timer = setTimeout(scan, 250);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(async (s) => {
        stream = s;
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = s;
        await videoRef.current.play();
        void scan();
      })
      .catch(() => setError("No se pudo acceder a la cámara. Revisa los permisos del navegador."));

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onDetected]);

  return (
    <Modal open={open} onClose={onClose} title="Escanear código de barras" width={460}>
      {error ? (
        <Alert tone="info">{error}</Alert>
      ) : (
        <div className="stack">
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: "100%", borderRadius: 8, background: "#000", aspectRatio: "4 / 3", objectFit: "cover" }}
          />
          <p className="note">Apunta la cámara al código EAN-13 o UPC-A del producto.</p>
        </div>
      )}
    </Modal>
  );
}

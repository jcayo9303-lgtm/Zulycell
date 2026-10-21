"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { Alert, Button, Modal } from "@/components/ui";
import s from "./inventory.module.css";

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

const getDetector = (): DetectorCtor | null =>
  typeof window !== "undefined" && "BarcodeDetector" in window
    ? ((window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector)
    : null;

/**
 * Escanea EAN-13 / UPC-A con la cámara (BarcodeDetector). Los lectores USB/Bluetooth
 * funcionan como teclado y escriben directamente en el campo de código.
 */
export function BarcodeScanButton({ onDetect }: { onDetect: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(Boolean(getDetector())), []);

  if (!supported) return null;
  return (
    <>
      <Button icon={<ScanLine size={14} />} onClick={() => setOpen(true)} aria-label="Escanear código de barras" />
      {open && (
        <ScannerModal
          onClose={() => setOpen(false)}
          onDetect={(code) => {
            setOpen(false);
            onDetect(code);
          }}
        />
      )}
    </>
  );
}

function ScannerModal({ onClose, onDetect }: { onClose: () => void; onDetect: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const Ctor = getDetector();
    if (!Ctor) return;
    const detector = new Ctor({ formats: ["ean_13", "upc_a"] });
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let done = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (st) => {
        stream = st;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = st;
        await video.play();
        timer = setInterval(async () => {
          if (done || video.readyState < 2) return;
          const found = await detector.detect(video).catch(() => []);
          const code = found.find((f) => /^\d{12,13}$/.test(f.rawValue))?.rawValue;
          if (code) {
            done = true;
            onDetect(code);
          }
        }, 300);
      })
      .catch(() => setError("No pudimos acceder a la cámara. Revisa los permisos del navegador."));

    return () => {
      done = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  return (
    <Modal open onClose={onClose} title="Escanear código de barras" width={420}>
      {error ? <Alert>{error}</Alert> : <video ref={videoRef} className={s.video} muted playsInline />}
      <p className="note" style={{ marginTop: 8 }}>
        Apunta la cámara al código EAN-13 o UPC-A.
      </p>
    </Modal>
  );
}

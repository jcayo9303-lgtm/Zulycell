"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Card, Empty, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/format";

type PublicPayment = {
  businessName: string;
  amount: number | null;
  description: string | null;
  status: "PENDING" | "PAID" | "CANCELLED";
  currency: string;
  currencySymbol: string;
};

const STATUS = {
  PENDING: { label: "Pendiente de pago", tone: "warning" },
  PAID: { label: "Pagado", tone: "success" },
  CANCELLED: { label: "Cancelado", tone: "danger" },
} as const;

export default function PublicPayPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicPayment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PublicPayment>(`/public/pay/${encodeURIComponent(token)}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Enlace no válido"));
  }, [token]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {error ? (
          <Empty title="Enlace de pago no disponible">{error}</Empty>
        ) : !data ? (
          <div style={{ textAlign: "center" }}>
            <Spinner />
          </div>
        ) : (
          <Card>
            <div className="stack" style={{ alignItems: "center", textAlign: "center", padding: "8px 0" }}>
              <div className="note">Cobro de</div>
              <h1 className="page-title">{data.businessName}</h1>
              <div style={{ fontSize: "var(--fs-login-title)", fontWeight: 700 }} className="num">
                {data.amount != null ? fmtMoney(data.amount, data.currency, data.currencySymbol) : "Monto a convenir"}
              </div>
              {data.description && <p className="muted">{data.description}</p>}
              <Badge tone={STATUS[data.status].tone}>{STATUS[data.status].label}</Badge>
              {data.status === "PENDING" && (
                <p className="note">Realiza el pago por el medio acordado con el negocio; ellos confirmarán la recepción.</p>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

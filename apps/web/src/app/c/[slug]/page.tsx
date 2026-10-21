"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { Alert, Button, Empty, Field, Input, Modal, SearchInput, Select, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import s from "./catalog.module.css";

type PublicCatalog = {
  business: {
    name: string;
    logoUrl: string | null;
    bannerUrl: string | null;
    color: string;
    description: string | null;
    whatsapp: string | null;
    currency: string;
    currencySymbol: string;
  };
  categories: { id: string; name: string }[];
  products: {
    id: string;
    name: string;
    description: string | null;
    categoryId: string | null;
    imageUrl: string | null;
    price: number;
    unit: string;
    available: boolean;
    variants: { id: string; type: string; value: string; price: number; available: boolean }[];
  }[];
};

type CartLine = { key: string; name: string; price: number; qty: number };

export default function PublicCatalogPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [customer, setCustomer] = useState({ name: "", notes: "" });

  useEffect(() => {
    api
      .get<PublicCatalog>(`/public/catalog/${encodeURIComponent(slug)}`)
      .then((r) => {
        setData(r);
        document.title = `${r.business.name} · Catálogo`;
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Catálogo no disponible"));
  }, [slug]);

  const products = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.products.filter(
      (p) => (!category || p.categoryId === category) && (!term || p.name.toLowerCase().includes(term)),
    );
  }, [data, category, q]);

  if (error) {
    return (
      <div className={s.center}>
        <Empty title="Catálogo no disponible">{error}</Empty>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={s.center}>
        <Spinner />
      </div>
    );
  }

  const b = data.business;
  const money = (n: number) => fmtMoney(n, b.currency, b.currencySymbol);
  const total = cart.reduce((acc, l) => acc + l.price * l.qty, 0);
  const count = cart.reduce((acc, l) => acc + l.qty, 0);

  const add = (line: Omit<CartLine, "qty">) =>
    setCart((prev) => {
      const found = prev.find((l) => l.key === line.key);
      return found ? prev.map((l) => (l.key === line.key ? { ...l, qty: l.qty + 1 } : l)) : [...prev, { ...line, qty: 1 }];
    });
  const changeQty = (key: string, delta: number) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0));

  const sendOrder = () => {
    const lines = cart.map((l) => `• ${l.qty} × ${l.name} — ${money(l.price * l.qty)}`);
    const text = [
      `Hola ${b.name}, quiero hacer este pedido:`,
      ...lines,
      `Total: ${money(total)}`,
      customer.name && `Nombre: ${customer.name}`,
      customer.notes && `Notas: ${customer.notes}`,
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`https://wa.me/${(b.whatsapp ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <div className={s.page} style={{ "--brand": b.color } as CSSProperties}>
      <div className={s.banner} style={b.bannerUrl ? { backgroundImage: `url("${b.bannerUrl}")` } : undefined} />
      <header className={s.header}>
        <div className={s.logo} style={b.logoUrl ? { backgroundImage: `url("${b.logoUrl}")` } : undefined} />
        <h1 className={s.title}>{b.name}</h1>
      </header>

      <main className={s.content}>
        {b.description && <p className="muted">{b.description}</p>}
        <SearchInput placeholder="Buscar producto" value={q} onChange={(e) => setQ(e.target.value)} />
        {data.categories.length > 0 && (
          <div className={s.chips}>
            <button className={`${s.chip} ${!category ? s.chipActive : ""}`} onClick={() => setCategory("")}>
              Todo
            </button>
            {data.categories.map((c) => (
              <button key={c.id} className={`${s.chip} ${category === c.id ? s.chipActive : ""}`} onClick={() => setCategory(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {!products.length ? (
          <Empty title="No hay productos para mostrar" />
        ) : (
          <div className={s.grid}>
            {products.map((p) => {
              const variantId = picked[p.id] ?? p.variants.find((v) => v.available)?.id ?? p.variants[0]?.id;
              const variant = p.variants.find((v) => v.id === variantId);
              const price = variant?.price ?? p.price;
              const available = variant ? variant.available : p.available;
              return (
                <article key={p.id} className={s.card}>
                  <div className={s.photo} style={p.imageUrl ? { backgroundImage: `url("${p.imageUrl}")` } : undefined} />
                  <div className={s.cardBody}>
                    <div className={s.name}>{p.name}</div>
                    {p.description && <div className="note">{p.description}</div>}
                    <div className={s.price}>{money(price)}</div>
                    {p.variants.length > 0 && (
                      <Select
                        aria-label={p.variants[0].type}
                        value={variantId}
                        onChange={(e) => setPicked({ ...picked, [p.id]: e.target.value })}
                        options={p.variants.map((v) => ({ value: v.id, label: `${v.value}${v.available ? "" : " (agotado)"}` }))}
                      />
                    )}
                    <button
                      className={s.add}
                      disabled={!available}
                      onClick={() =>
                        add({ key: variant ? variant.id : p.id, name: variant ? `${p.name} (${variant.value})` : p.name, price })
                      }
                    >
                      {available ? "Agregar" : "Agotado"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <p className="note" style={{ textAlign: "center" }}>
          Catálogo creado con zulycell
        </p>
      </main>

      {count > 0 && (
        <button className={s.cartBar} onClick={() => setCartOpen(true)}>
          <span>
            Ver pedido · {count} {count === 1 ? "producto" : "productos"}
          </span>
          <span>{money(total)}</span>
        </button>
      )}

      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="Tu pedido"
        width={460}
        footer={
          <Button variant="primary" block onClick={sendOrder} disabled={!b.whatsapp || !cart.length}>
            Enviar pedido por WhatsApp
          </Button>
        }
      >
        <div className="stack">
          <table className="table">
            <tbody>
              {cart.map((l) => (
                <tr key={l.key}>
                  <td>{l.name}</td>
                  <td>
                    <span className={s.qty}>
                      <button onClick={() => changeQty(l.key, -1)} aria-label="Quitar uno">
                        −
                      </button>
                      <span className="num">{l.qty}</span>
                      <button onClick={() => changeQty(l.key, 1)} aria-label="Agregar uno">
                        +
                      </button>
                    </span>
                  </td>
                  <td className="num">{money(l.price * l.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row-between card-title">
            <span>Total</span>
            <span className="num">{money(total)}</span>
          </div>
          <Field label="Tu nombre">
            <Input maxLength={100} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          </Field>
          <Field label="Notas (dirección, hora de entrega…)">
            <Textarea maxLength={255} value={customer.notes} onChange={(e) => setCustomer({ ...customer, notes: e.target.value })} />
          </Field>
          {!b.whatsapp && <Alert tone="info">Este negocio aún no configuró su WhatsApp de pedidos.</Alert>}
        </div>
      </Modal>
    </div>
  );
}

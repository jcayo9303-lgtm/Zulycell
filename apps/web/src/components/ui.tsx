"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ImagePlus, Search, X } from "lucide-react";
import s from "./ui.module.css";
import { uploadImage } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ── Button ────────────────────────────────────────────────────────────

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  icon?: ReactNode;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", block, icon, loading, children, className, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(s.btn, s[variant], size !== "md" && s[size], block && s.block, !children && s.iconOnly, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className={s.spinner} /> : icon}
      {children}
    </button>
  );
});

// ── Field + inputs ────────────────────────────────────────────────────

type FieldProps = {
  label?: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
};

export function Field({ label, required, hint, error, children, className }: FieldProps) {
  return (
    <label className={cx(s.field, className)}>
      {label && (
        <span className={s.label}>
          {label}
          {required && <span className={s.required}>*</span>}
        </span>
      )}
      {children}
      {error ? <span className={s.error}>{error}</span> : hint ? <span className={s.hint}>{hint}</span> : null}
    </label>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, className, ...rest }, ref) {
  return <input ref={ref} className={cx(s.input, className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const SearchInput = forwardRef<HTMLInputElement, InputProps>(function SearchInput(props, ref) {
  return (
    <div className={s.inputGroup}>
      <span className={s.inputIcon}>
        <Search size={14} />
      </span>
      <Input ref={ref} type="search" {...props} />
    </div>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[];
  placeholder?: string;
  invalid?: boolean;
};

export function Select({ options, placeholder, invalid, className, ...rest }: SelectProps) {
  return (
    <select className={cx(s.input, className)} aria-invalid={invalid || undefined} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(s.input, className)} {...rest} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={s.toggle}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={s.toggleTrack} />
      {label}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className={s.segmented} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={cx(s.segment, value === o.value && s.segmentActive)}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────

export function Card({
  title,
  actions,
  children,
  flush,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={cx(s.card, className)}>
      {(title || actions) && (
        <header className={s.cardHeader}>
          {typeof title === "string" ? <h2 className="card-title">{title}</h2> : title}
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      <div className={flush ? s.cardFlush : s.cardBody}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={s.pageHeader}>
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className={s.pageSubtitle}>{subtitle}</p>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, foot, tone }: { label: string; value: ReactNode; foot?: ReactNode; tone?: "success" | "danger" }) {
  return (
    <div className={cx(s.card, s.kpi)}>
      <div className={s.kpiLabel}>{label}</div>
      <div className={cx(s.kpiValue, tone === "success" && "text-success", tone === "danger" && "text-danger")}>{value}</div>
      {foot && <div className={s.kpiFoot}>{foot}</div>}
    </div>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: "success" | "danger" | "warning" | "info" | "pro" }) {
  return <span className={cx(s.badge, tone && s[`badge_${tone}`])}>{children}</span>;
}


export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: ReactNode }[];
}) {
  return (
    <div className={s.tabs} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={cx(s.tab, value === t.value && s.tabActive)}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      <div className={s.emptyTitle}>{title}</div>
      {children && <div className="note">{children}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export const Spinner = () => <span className={s.spinner} aria-label="Cargando" />;

export function Loading() {
  return (
    <div className={s.empty}>
      <Spinner />
    </div>
  );
}

export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "info" }) {
  return <div className={cx(s.alert, tone === "info" && s.alertInfo)}>{children}</div>;
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className={s.pager}>
      <span>
        {total} registros · página {page} de {pages}
      </span>
      <div className="row">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={s.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <div className={s.modalHeader}>
          <h2 className="card-title">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar" icon={<X size={16} />} />
        </div>
        <div className={s.modalBody}>{children}</div>
        {footer && <div className={s.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmación simple para acciones destructivas */
export function useConfirm() {
  return useCallback((message: string) => window.confirm(message), []);
}

// ── Combobox de búsqueda asíncrona ───────────────────────────────────

export function Combobox<T>({
  fetcher,
  onSelect,
  renderItem,
  placeholder,
  value,
  onClear,
  autoFocus,
}: {
  fetcher: (q: string) => Promise<T[]>;
  onSelect: (item: T) => void;
  renderItem: (item: T) => ReactNode;
  placeholder?: string;
  /** Texto del elemento seleccionado (modo "seleccionado") */
  value?: string | null;
  onClear?: () => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<T[]>([]);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(q, 200);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetcher(debounced)
      .then((r) => !cancelled && (setItems(r), setActive(0)))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (value) {
    return (
      <div className="row">
        <Input value={value} readOnly className="grow" />
        {onClear && <Button variant="ghost" onClick={onClear} aria-label="Quitar" icon={<X size={14} />} />}
      </div>
    );
  }

  const choose = (item: T) => {
    onSelect(item);
    setQ("");
    setOpen(false);
  };

  return (
    <div className={s.combo} ref={boxRef}>
      <SearchInput
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, items.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && items[active]) {
            e.preventDefault();
            choose(items[active]);
          }
        }}
      />
      {open && items.length > 0 && (
        <ul className={s.comboList} id={listId} role="listbox">
          {items.map((item, i) => (
            <li
              key={i}
              role="option"
              aria-selected={i === active}
              className={cx(s.comboItem, i === active && s.comboItemActive)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item);
              }}
            >
              {renderItem(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Subida de imagen ──────────────────────────────────────────────────

export function ImageUpload({
  url,
  onChange,
  folder,
  label = "Subir imagen",
}: {
  url: string | null;
  onChange: (v: { key: string; url: string } | null) => void;
  folder: Parameters<typeof uploadImage>[1];
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={s.imageBox}>
      <div className={s.imagePreview} style={url ? { backgroundImage: `url("${url}")` } : undefined}>
        {!url && <ImagePlus size={20} />}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row">
          <Button size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
            {label}
          </Button>
          {url && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
              Quitar
            </Button>
          )}
        </div>
        <span className={error ? s.error : s.hint}>{error ?? "JPG o PNG, máximo 5 MB"}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) return setError("La imagen supera 5 MB");
          setBusy(true);
          setError(null);
          try {
            onChange(await uploadImage(file, folder));
          } catch (err) {
            setError(err instanceof Error ? err.message : "No se pudo subir");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

// ── Toasts ────────────────────────────────────────────────────────────

type Toast = { id: number; text: string; error?: boolean };
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className={s.toasts} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx(s.toast, t.error && s.toastError)}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** toast("Guardado") · toast("Error", true) */
export const useToast = () => useContext(ToastContext);

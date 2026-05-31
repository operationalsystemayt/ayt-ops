// components/ui/index.tsx
"use client";
import { forwardRef, InputHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

// ─── NumericInput ─────────────────────────────────────────────────────────────
interface NumericInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: number | "";
  onChange: (val: number | "") => void;
  className?: string;
}
export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onChange, className, ...rest }, ref) => (
    <input
      ref={ref}
      type="number"
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? "" : Number(raw));
      }}
      className={clsx(
        "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2",
        "text-sm text-neutral-100 font-mono placeholder-neutral-600",
        "focus:outline-none focus:border-teal-500 transition-colors",
        className
      )}
      {...rest}
    />
  )
);
NumericInput.displayName = "NumericInput";

// ─── TextInput ────────────────────────────────────────────────────────────────
interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ value, onChange, className, ...rest }, ref) => (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(
        "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2",
        "text-sm text-neutral-100 placeholder-neutral-600",
        "focus:outline-none focus:border-teal-500 transition-colors",
        className
      )}
      {...rest}
    />
  )
);
TextInput.displayName = "TextInput";

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}
export function Select({ value, onChange, options, className, ...rest }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(
        "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-2",
        "text-xs text-neutral-400 focus:outline-none focus:border-teal-500 transition-colors cursor-pointer",
        className
      )}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
type ButtonVariant = "primary" | "outline" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-teal-500 hover:bg-teal-400 text-neutral-950 font-semibold",
  outline: "border border-neutral-600 hover:border-teal-500 hover:text-teal-400 text-neutral-300 bg-transparent",
  ghost:   "text-neutral-400 hover:text-neutral-100 bg-transparent",
  danger:  "bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30",
  success: "bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 border border-teal-500/30",
};
const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export function Button({ variant = "primary", size = "md", loading, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        "rounded-lg font-medium transition-all cursor-pointer",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...rest}
    >
      {loading ? "..." : children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";
const badgeClasses: Record<BadgeVariant, string> = {
  default: "bg-neutral-700 text-neutral-300",
  success: "bg-teal-500/20 text-teal-400 border border-teal-500/30",
  warning: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  danger:  "bg-red-500/20 text-red-400 border border-red-500/30",
  info:    "bg-blue-500/20 text-blue-400 border border-blue-500/30",
};
export function Badge({ variant = "default", children, className }: { variant?: BadgeVariant; children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", badgeClasses[variant], className)}>
      {children}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        "bg-neutral-900 border border-neutral-800 rounded-xl p-5",
        onClick && "cursor-pointer hover:border-neutral-700 transition-colors",
        className
      )}
    >
      {children}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title?: string }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
            <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-100 text-xl leading-none cursor-pointer">×</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
export function SectionHeader({ children, accent }: { children: React.ReactNode; accent?: "teal" | "amber" | "neutral" }) {
  const colors = {
    teal: "text-teal-400",
    amber: "text-amber-400",
    neutral: "text-neutral-400",
  };
  return (
    <div className={clsx(
      "text-xs font-semibold uppercase tracking-widest pb-3 mb-4 border-b border-neutral-800",
      colors[accent ?? "neutral"]
    )}>
      {children}
    </div>
  );
}

// ─── FormField ────────────────────────────────────────────────────────────────
export function FormField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label className="text-xs text-neutral-500 font-medium">{label}</label>
      {children}
    </div>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────
export function Divider() {
  return <div className="border-t border-neutral-800 my-5" />;
}

// ─── EmptyState ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, desc, action }: { icon?: string; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-6">
      {icon && <div className="text-5xl mb-4">{icon}</div>}
      <div className="text-base font-medium text-neutral-200 mb-2">{title}</div>
      {desc && <div className="text-sm text-neutral-500 mb-6 max-w-xs">{desc}</div>}
      {action}
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

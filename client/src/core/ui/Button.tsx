import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import type { ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-on-surface border-transparent",
  secondary: "bg-surface-raised text-on-surface hover:bg-surface-hover border-outline-strong",
  ghost: "bg-transparent text-on-surface-muted hover:text-on-surface hover:bg-surface-hover border-transparent",
  danger: "bg-transparent text-danger hover:bg-danger/10 border-danger/40",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5",
  md: "h-10 px-3.5 text-sm gap-2",
};

export interface ButtonProps extends AriaButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md border-[length:var(--control-border-width,1px)] font-medium select-none transition-[background-color,color,transform] duration-100 pressed:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className ?? ""}`}
    />
  );
}

/** Square icon-only button with a 40px hit area. */
export function IconButton({ label, className, size = "md", ...props }: ButtonProps & { label: string }) {
  return (
    <AriaButton
      aria-label={label}
      {...props}
      className={`hit-40 inline-flex items-center justify-center rounded-md text-on-surface-muted hover:text-on-surface hover:bg-surface-hover transition-colors duration-100 pressed:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${size === "sm" ? "size-7" : "size-9"} ${className ?? ""}`}
    />
  );
}

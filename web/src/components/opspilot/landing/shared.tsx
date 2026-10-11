"use client";

/**
 * Shared landing helpers.
 *
 * The app uses a hash router (#/overview, ...), so plain in-page anchors like
 * href="#simulation" would be interpreted as routes. Landing links therefore
 * preventDefault and smooth-scroll by id instead of touching the hash.
 */

import type { ReactNode } from "react";
import { APP_SIGN_UP_URL, APP_URL } from "./site-config";

export function scrollToId(id: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

interface SectionLinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  /** DOM id of the target section. */
  to: string;
  /** Called after the scroll begins (e.g. to close the mobile nav). */
  onNavigate?: () => void;
}

/** Anchor that scrolls to a section without changing the hash route. */
export function SectionLink({ to, onNavigate, children, ...rest }: SectionLinkProps) {
  return (
    <a
      href={`#${to}`}
      onClick={(event) => {
        event.preventDefault();
        scrollToId(to);
        onNavigate?.();
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/**
 * Primary landing CTA ("Get Started").
 *
 * While the real application URL is not configured in `site-config.ts`, the
 * CTA links to the local account creation page (#/register). When APP_URL is
 * set, it links straight to the product instead.
 */
export function AppCta({
  className,
  onNavigate,
  children,
}: {
  className?: string;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  return (
    <a
      className={className}
      href={APP_URL ?? APP_SIGN_UP_URL}
      onClick={() => onNavigate?.()}
    >
      {children}
    </a>
  );
}

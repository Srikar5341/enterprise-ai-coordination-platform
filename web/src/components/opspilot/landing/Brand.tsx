"use client";

/**
 * Renova brand components for the public landing page.
 * The mark is the approved "Futuristic Orbital Arrow Emblem" asset, pre-processed
 * (rounded tile) into /images/renova-mark.png by scripts/make-renova-assets.mjs.
 * Regenerate it rather than swapping in a different glyph.
 */
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

export function Mark({ small = false }: { small?: boolean }) {
  return (
    <img
      src="/images/renova-mark.png"
      alt=""
      aria-hidden="true"
      className={small ? "brand-mark brand-mark--small" : "brand-mark"}
      width={29}
      height={29}
      decoding="async"
    />
  );
}

export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <a className={`brand${dark ? " brand--dark" : ""}`} href="#/" aria-label="Renova home">
      <Mark />
      <span>Renova</span>
    </a>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="text-link" href={href}>
      {children}
      <ArrowUpRight size={14} aria-hidden="true" />
    </a>
  );
}

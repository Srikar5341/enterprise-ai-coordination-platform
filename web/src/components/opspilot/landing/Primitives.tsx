"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Brand } from "./Brand";
import { AppCta, SectionLink } from "./shared";

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="eyebrow">
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export function SectionLabel({ index, label }: { index: string; label: string }) {
  return (
    <div className="section-label">
      <span>{index}</span>
      <i aria-hidden="true" />
      {label}
    </div>
  );
}

const NAV_SECTIONS = [
  { id: "product", label: "Product" },
  { id: "simulation", label: "How It Works" },
  { id: "recovery-engine", label: "Recovery Engine" },
  { id: "security", label: "Security" },
] as const;

export function Navbar({
  menuOpen,
  onToggle,
  onNavigate,
}: {
  menuOpen: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (menuOpen) {
      const frame = window.requestAnimationFrame(() =>
        navRef.current?.querySelector<HTMLElement>("a[href]")?.focus(),
      );
      wasOpen.current = true;
      return () => window.cancelAnimationFrame(frame);
    }
    if (wasOpen.current) menuButtonRef.current?.focus();
    wasOpen.current = false;
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onNavigate();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [menuOpen, onNavigate]);

  return (
    <header className="site-header">
      <div className="nav-shell page-width">
        <Brand />
        <nav
          ref={navRef}
          id="primary-navigation"
          className={`primary-nav${menuOpen ? " primary-nav--open" : ""}`}
          aria-label="Main navigation"
        >
          {NAV_SECTIONS.map(({ id, label }) => (
            <SectionLink key={id} to={id} onNavigate={onNavigate}>
              {label}
            </SectionLink>
          ))}
        </nav>
        <div className="nav-actions">
          <AppCta className="button button--blue button--nav" onNavigate={onNavigate}>
            Get Started <ArrowRight size={14} />
          </AppCta>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          className="mobile-menu-toggle"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={onToggle}
        >
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
    </header>
  );
}

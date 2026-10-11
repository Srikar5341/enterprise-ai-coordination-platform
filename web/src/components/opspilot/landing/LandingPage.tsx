"use client";

/**
 * Renova marketing landing page.
 *
 * Ported from the uploaded design zip and adapted for the hash-router app:
 * - in-page anchors use scroll handlers instead of hash links (the hash is the route),
 * - primary CTAs ("Get Started") link to the account creation page (#/register)
 *   until the real app URL is set in ./site-config.ts; there is no sign-in entry
 *   point on the landing page,
 * - all landing styles live in src/app/landing.css scoped under `.ops-landing`.
 */
import { useEffect, useRef, useState } from "react";
import { usePageReveals } from "./useMotion";
import ProductGallery from "./ProductGallery";
import {
  CapabilityStrip,
  Dialog,
  FinalCTA,
  HeroSection,
  HumanControlSection,
  RecoverySection,
  RoleSwitcher,
  SectionIntro,
  SiteFooter,
} from "./ExperienceSections";
import { DominoSimulator, WorkflowBuilderDemo } from "./InteractiveDemos";
import { Navbar, SectionLabel } from "./Primitives";
import type { RecoveryChoice } from "./ProductScreens";

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reviewChoice, setReviewChoice] = useState<RecoveryChoice | null>(null);
  const reviewOpen = reviewChoice !== null;
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  usePageReveals();

  const openReview = (choice: RecoveryChoice) => {
    lastTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setReviewChoice(choice);
  };
  const closeReview = () => setReviewChoice(null);

  useEffect(() => {
    if (!reviewOpen) {
      lastTriggerRef.current?.focus();
      lastTriggerRef.current = null;
      return;
    }
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const firstControl = dialog?.querySelector<HTMLElement>(
        'button:not([disabled]),a[href],[tabindex="0"]',
      );
      (firstControl ?? dialog)?.focus();
    });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeReview();
        return;
      }
      const dialog = dialogRef.current;
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]'),
      );
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active) || active === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [reviewOpen]);

  const skipToContent = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const main = document.getElementById("main-content");
    if (!main) return;
    main.focus({ preventScroll: true });
    main.scrollIntoView({ behavior: "auto", block: "start" });
  };

  return (
    <div className="ops-landing" id="top">
      <a className="skip-link" href="#main-content" onClick={skipToContent}>
        Skip to content
      </a>
      <div className="site-atmosphere" aria-hidden="true" />
      <Navbar menuOpen={menuOpen} onToggle={() => setMenuOpen((value) => !value)} onNavigate={() => setMenuOpen(false)} />
      <main id="main-content" tabIndex={-1}>
        <HeroSection />
        <CapabilityStrip />
        <section className="domino-section" id="domino" aria-labelledby="domino-title">
          <div className="page-width">
            <SectionIntro
              index="01"
              titleId="domino-title"
              eyebrow="THE DOMINO EFFECT"
              title={
                <>
                  One blocked task can
                  <br />
                  <span>change everything.</span>
                </>
              }
              description="Dependencies connect work together. When one part of the plan changes, teams need to understand what else may be affected."
            />
            <DominoSimulator />
          </div>
        </section>
        <section className="workflow-section" id="simulation" aria-labelledby="workflow-title">
          <div className="page-width">
            <div className="workflow-section-heading reveal">
              <div className="workflow-title-copy">
                <SectionLabel index="02" label="GOAL TO EXECUTION" />
                <h2 id="workflow-title">
                  From a single sentence
                  <br />
                  <span>to a coordinated plan.</span>
                </h2>
                <p>
                  Start with the outcome. Review the proposed work. Coordinate the people
                  responsible for delivering it.
                </p>
              </div>
              <div className="workflow-side-note">
                <span aria-hidden="true">⌖</span>
                <span>
                  GOAL → TASKS
                  <br />
                  DEPENDENCIES → REVIEW
                </span>
              </div>
            </div>
            <WorkflowBuilderDemo />
          </div>
        </section>
        <RecoverySection onReview={openReview} />
        <HumanControlSection />
        <RoleSwitcher />
        <ProductGallery />
        <FinalCTA />
      </main>
      <SiteFooter onNavigate={() => setMenuOpen(false)} />
      {reviewChoice && <Dialog choice={reviewChoice} onClose={closeReview} dialogRef={dialogRef} />}
    </div>
  );
}

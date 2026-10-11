"use client";

import { useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleCheck,
  LockKeyhole,
  Network,
  Pause,
  Play,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { useInView, useReducedMotion } from "./useMotion";
import { Mark } from "./Brand";
import {
  ApprovalPanel,
  CapacityFloat,
  EmployeeWorkspacePreview,
  LeadWorkspacePreview,
  ProductPreview,
  RecoveryDemo,
  RecoveryFloat,
  recoveryChoiceDetails,
  type RecoveryChoice,
} from "./ProductScreens";
import { Eyebrow, SectionLabel } from "./Primitives";
import { AppCta, SectionLink, scrollToId } from "./shared";

export function HeroSection() {
  const { ref, inView } = useInView<HTMLElement>(0.06);
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState(0);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const updateVisibility = () => setTabVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (reduced) {
      setPhase(7);
      return;
    }
    if (paused || !inView || !tabVisible) return;
    const timer = window.setInterval(() => setPhase((value) => (value + 1) % 8), 1500);
    return () => window.clearInterval(timer);
  }, [inView, paused, reduced, tabVisible]);

  const isMotionOn = !paused && !reduced && inView && tabVisible;
  return (
    <section
      className="hero-section"
      id="product"
      ref={ref}
      data-motion={isMotionOn ? "on" : "off"}
      aria-labelledby="hero-title"
    >
      <div className="hero-ambient" aria-hidden="true">
        <svg viewBox="0 0 1440 700" preserveAspectRatio="none">
          <path d="M650 95C780 40 822 212 940 165S1120 81 1215 168s110 174 195 124" />
          <path d="M720 415c120-130 224-35 315-99s171-67 259 21" />
          <path d="M860 606c80-71 118-125 218-100 98 26 172-55 215-101" />
          <circle cx="942" cy="164" r="3" />
          <circle cx="1212" cy="169" r="4" />
          <circle cx="1035" cy="315" r="3" />
          <circle cx="1330" cy="336" r="4" />
          <circle cx="1075" cy="506" r="3" />
        </svg>
      </div>
      <div className="hero-grid page-width">
        <div className="hero-copy">
          <Eyebrow>INTELLIGENCE FOR TEAMS THAT SHIP</Eyebrow>
          <h1 id="hero-title">
            Plans change.
            <br />
            Your team stays
            <br />
            <span className="gradient-word">in motion.</span>
          </h1>
          <p className="hero-lede">
            Renova turns team goals into coordinated workflows and helps your team recover when
            blockers threaten the plan.
          </p>
          <div className="hero-actions">
            <AppCta className="button button--blue button--hero">
              Get Started <ArrowRight size={16} />
            </AppCta>
            <SectionLink className="button button--ghost button--hero-secondary" to="simulation">
              <Play size={14} fill="currentColor" />
              Watch the System Work
            </SectionLink>
          </div>
          <div className="hero-capabilities">
            <span>Smart Planning</span>
            <i />
            <span>Impact Analysis</span>
            <i />
            <span>Recovery Intelligence</span>
          </div>
          <p className="hero-trustline">
            <ShieldCheck size={14} />
            Built for software teams <i /> Designed for human-controlled decisions
          </p>
          <p className="hero-tagline">When plans change, progress continues.</p>
        </div>
        <div
          className={`hero-composition${paused ? " hero-composition--paused" : ""}`}
          data-motion={isMotionOn ? "on" : "off"}
          data-phase={phase}
        >
          <div className="hero-connection-map" aria-hidden="true">
            <svg viewBox="0 0 850 520">
              <path d="M77 112C178 75 218 155 306 123s122-40 191 8 128 44 189 3" />
              <path d="M138 394c72-84 111-112 202-87s118 44 205 9 106-58 176-7" />
              <circle cx="307" cy="122" r="4" />
              <circle cx="497" cy="131" r="4" />
              <circle cx="685" cy="134" r="3" />
              <circle cx="340" cy="307" r="3" />
              <circle cx="545" cy="316" r="3" />
            </svg>
          </div>
          <div className="hero-product-main">
            <ProductPreview stage={phase} />
            <span className="composition-caption">
              <span className="live-dot" />
              ILLUSTRATIVE PRODUCT PREVIEW · SAMPLE WORKFLOW DATA
            </span>
          </div>
          <CapacityFloat />
          <RecoveryFloat stage={phase} />
          <button
            type="button"
            className="motion-toggle"
            aria-pressed={paused || reduced}
            disabled={reduced}
            aria-label={
              reduced
                ? "Motion is disabled by your reduced-motion preference"
                : paused
                  ? "Play the hero sequence"
                  : "Pause the hero sequence"
            }
            onClick={() => setPaused((value) => !value)}
          >
            <span>{paused || reduced ? <Play size={13} /> : <Pause size={13} />}</span>
            {reduced ? "Motion reduced" : paused ? "Play motion" : "Pause motion"}
          </button>
        </div>
      </div>
      <div className="hero-bottomline page-width">
        <span>ONE RELEASE · FIVE CONNECTED WORK ITEMS</span>
        <span>
          Plan → Allocate → Detect → Recover → Verify <ArrowRight size={13} />
        </span>
      </div>
    </section>
  );
}

const signals = [
  { label: "GOAL → WORKFLOW", icon: Target },
  { label: "SKILL-AWARE ALLOCATION", icon: Users },
  { label: "DEPENDENCY IMPACT", icon: Activity },
  { label: "APPROVE → VERIFY", icon: ShieldCheck },
];

export function CapabilityStrip() {
  return (
    <section className="capability-strip reveal" aria-label="Renova capabilities">
      <div className="capability-inner">
        {signals.map(({ label, icon: Icon }, index) => (
          <div className="capability-item" key={label}>
            <span className="capability-icon">
              <Icon size={15} />
            </span>
            <span>{label}</span>
            <i className={`capability-signal capability-signal--${index + 1}`} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SectionIntro({
  index,
  eyebrow,
  title,
  description,
  titleId,
}: {
  index: string;
  eyebrow: string;
  title: ReactNode;
  description: string;
  titleId?: string;
}) {
  return (
    <div className="section-intro reveal">
      <SectionLabel index={index} label={eyebrow} />
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function RecoverySection({ onReview }: { onReview: (choice: RecoveryChoice) => void }) {
  return (
    <section className="recovery-section" id="recovery-engine" aria-labelledby="recovery-title">
      <div className="recovery-glow" aria-hidden="true" />
      <div className="recovery-wrap page-width">
        <div className="recovery-intro reveal">
          <Eyebrow>THE RECOVERY ENGINE</Eyebrow>
          <h2 id="recovery-title">
            Don&apos;t just detect disruption.
            <br />
            <span>Explore the recovery.</span>
          </h2>
          <p>
            When availability or task status changes, Renova helps identify affected downstream
            work and compare feasible ways forward.
          </p>
          <div className="recovery-guardrail">
            <ShieldCheck size={15} />
            Options reflect skills, availability, workload, permissions and dependency constraints
            in the displayed sample.
          </div>
        </div>
        <RecoveryDemo onReview={onReview} />
        <div className="recovery-standfirst">
          <span>
            <i className="amber-dot" />
            Awaiting Lead Approval
          </span>
          <span>
            Proposed options are not applied · Actual feasibility depends on real team and workflow
            state.
          </span>
        </div>
      </div>
    </section>
  );
}

const approvalStages = [
  {
    number: "01",
    title: "ANALYZE",
    copy: "Identify potentially affected tasks, dependencies, and constraints.",
    icon: Activity,
  },
  {
    number: "02",
    title: "APPROVE",
    copy: "An authorized lead reviews, edits, accepts, or rejects the proposal.",
    icon: ShieldCheck,
  },
  {
    number: "03",
    title: "VERIFY",
    copy: "After approval, revalidate current state, apply only permitted changes, then read back resulting records.",
    icon: CircleCheck,
  },
];

export function HumanControlSection() {
  return (
    <section className="control-section" id="security" aria-labelledby="control-title">
      <div className="page-width">
        <div className="section-intro section-intro--row reveal">
          <div>
            <SectionLabel index="04" label="HUMAN APPROVAL · REAL VERIFICATION" />
            <h2 id="control-title">
              Intelligence with a
              <br />
              <span>control layer.</span>
            </h2>
          </div>
          <p>
            The authorized lead remains the decision-maker. A plan is only a proposal until it is
            approved—and never shown as persisted until its resulting state has been checked.
          </p>
        </div>
        <div className="approval-flow reveal is-approval-flow">
          {approvalStages.map(({ number, title, copy, icon: Icon }, index) => (
            <article className="approval-flow-step" key={number}>
              <div className="flow-step-head">
                <span>{number}</span>
                <Icon size={18} />
                {index < 2 && <i className="approval-connector" aria-hidden="true" />}
              </div>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
        <div className="control-detail">
          <div className="control-detail-copy">
            <span className="overline">PROPOSAL → PERMISSION → READ-BACK</span>
            <h3>Make the state of a decision visible.</h3>
            <p>
              Review the proposed assignee and assumptions. Approval is intentionally disabled in
              this illustrative UI. Verification stays pending until a backend-approved update
              exists and can be read back. On this concept page every stage is illustrated with
              sample data; in the product build, verification executes against the live backend
              after an authorized approval.
            </p>
            <div className="control-assurance">
              <LockKeyhole size={14} />
              Static preview only · no sample change has been applied.
            </div>
          </div>
          <ApprovalPanel />
        </div>
      </div>
    </section>
  );
}

export function RoleSwitcher() {
  const [role, setRole] = useState<"leads" | "employees">("leads");
  const chooseRole = (value: "leads" | "employees") => setRole(value);
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let next: "leads" | "employees";
    if (event.key === "Home") next = "leads";
    else if (event.key === "End") next = "employees";
    else if (event.key === "ArrowRight") next = role === "leads" ? "employees" : "leads";
    else if (event.key === "ArrowLeft") next = role === "leads" ? "employees" : "leads";
    else return;
    event.preventDefault();
    chooseRole(next);
    document.getElementById(`role-tab-${next}`)?.focus();
  };
  return (
    <section className="role-section" id="team-views" aria-labelledby="role-title">
      <div className="page-width">
        <div className="role-heading reveal">
          <SectionLabel index="05" label="BUILT FOR HUMANS, POWERED BY INTELLIGENCE" />
          <h2 id="role-title">
            One shared plan.
            <br />
            <span>Two clear perspectives.</span>
          </h2>
          <p>Coordination meets people where their work happens.</p>
        </div>
        <div
          className="role-tabs"
          role="tablist"
          aria-orientation="horizontal"
          aria-label="Choose an illustrative Renova workspace"
        >
          <button
            id="role-tab-leads"
            type="button"
            role="tab"
            aria-selected={role === "leads"}
            aria-controls="role-panel"
            tabIndex={role === "leads" ? 0 : -1}
            onClick={() => chooseRole("leads")}
            onKeyDown={onTabKeyDown}
          >
            TEAM LEADS
            <span>01</span>
          </button>
          <button
            id="role-tab-employees"
            type="button"
            role="tab"
            aria-selected={role === "employees"}
            aria-controls="role-panel"
            tabIndex={role === "employees" ? 0 : -1}
            onClick={() => chooseRole("employees")}
            onKeyDown={onTabKeyDown}
          >
            EMPLOYEES
            <span>02</span>
          </button>
          <i className={`role-tab-indicator role-tab-indicator--${role}`} aria-hidden="true" />
        </div>
        <div
          id="role-panel"
          role="tabpanel"
          aria-labelledby={`role-tab-${role}`}
          className={`role-panel role-panel--${role}`}
          key={role}
        >
          <div className="role-panel-copy">
            <span className="overline">
              {role === "leads" ? "TEAM LEAD WORKSPACE" : "EMPLOYEE WORKSPACE"}
            </span>
            <h3>
              {role === "leads"
                ? "See the trade-offs. Keep the decision yours."
                : "Know what is yours—and what changed."}
            </h3>
            <p>
              {role === "leads"
                ? "Review the generated plan, evaluate team workload, monitor blockers and downstream dependency impact, compare feasible recovery alternatives — and keep approval authority for team-level recovery."
                : "Work your assigned tasks with dependencies and acceptance criteria in view, report blockers early, and use the AI Work Assistant for research, checklists, and drafts. Team-level recovery stays with your lead."}
            </p>
            <ul>
              {(role === "leads"
                ? [
                    "Goal-to-plan creation and review",
                    "Team workload and deadline-risk monitoring",
                    "Blocker impact and downstream dependencies",
                    "Recovery alternatives comparison",
                    "Change approval authority",
                  ]
                : [
                    "Assigned tasks, dependencies and acceptance criteria",
                    "Task status updates",
                    "Blocker reporting",
                    "Progress history and notifications",
                    "AI Work Assistant drafts — research, plans, docs, tests",
                  ]
              ).map((item) => (
                <li key={item}>
                  <Check size={14} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="role-preview">
            {role === "leads" ? <LeadWorkspacePreview /> : <EmployeeWorkspacePreview />}
            <span className="role-preview-caption">
              <i className="live-dot" />
              ILLUSTRATIVE ROLE VIEW · SAMPLE DATA
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FinalCTA() {
  const { ref, inView } = useInView<HTMLElement>(0.08);
  const reduced = useReducedMotion();
  return (
    <section
      className="final-cta"
      id="get-started"
      ref={ref}
      data-motion={inView && !reduced ? "on" : "off"}
      aria-labelledby="final-cta-title"
    >
      <img
        className="cta-art"
        src="/images/landing-cta.jpg"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      />
      <div className="cta-light" aria-hidden="true" />
      <div className="cta-net" aria-hidden="true">
        <Network size={196} strokeWidth={0.55} />
      </div>
      <div className="final-cta-content page-width reveal">
        <span className="overline">AI-ASSISTED PLANNING · HUMAN-APPROVED RECOVERY</span>
        <h2 id="final-cta-title">
          Keep the plan <span>moving.</span>
        </h2>
        <p>
          Build coordinated workflows. Understand disruptions. Choose your next move with
          confidence.
        </p>
        <div className="hero-actions">
          <AppCta className="button button--blue button--hero">
            Get Started <ArrowRight size={16} />
          </AppCta>
          <SectionLink className="button button--ghost button--hero-secondary" to="simulation">
            <Play size={14} fill="currentColor" />
            See How It Works
          </SectionLink>
        </div>
        <small>When plans change, progress continues.</small>
      </div>
    </section>
  );
}

const FOOTER_SECTIONS = [
  {
    heading: "PRODUCT",
    links: [
      { label: "Product", to: "product" },
      { label: "How It Works", to: "simulation" },
      { label: "Recovery Engine", to: "recovery-engine" },
      { label: "Security", to: "security" },
    ],
  },
];

export function SiteFooter({ onNavigate }: { onNavigate: () => void }) {
  return (
    <footer className="site-footer">
      <div className="footer-network" aria-hidden="true" />
      <div className="page-width footer-content">
        <div className="footer-main">
          <div className="footer-brand">
            <a className="brand" href="#/" aria-label="Renova home">
              <Mark />
              <span>Renova</span>
            </a>
            <p>When plans change, progress continues. Team coordination and workflow recovery, illustrated through one Friday-release plan.</p>
            <span className="footer-truth">
              <i />
              Illustrative concept · demos use sample data — no live AI
            </span>
          </div>
          <div className="footer-nav">
            {FOOTER_SECTIONS.map(({ heading, links }) => (
              <div key={heading}>
                <span>{heading}</span>
                {links.map(({ label, to }) => (
                  <SectionLink key={to} to={to} onNavigate={onNavigate}>
                    {label}
                  </SectionLink>
                ))}
              </div>
            ))}
            <div>
              <span>DEMO</span>
              <SectionLink to="domino" onNavigate={onNavigate}>
                Interactive product demo
              </SectionLink>
            </div>
            <div>
              <span>PLACEHOLDERS</span>
              <span className="footer-nav-soon">
                Privacy Policy <small>not yet published</small>
              </span>
              <span className="footer-nav-soon">
                Terms <small>not yet published</small>
              </span>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Renova. Illustrative product concept.</span>
          <span>
            Plan <i /> Allocate <i /> Recover with control
          </span>
          <button
            type="button"
            className="footer-toplink"
            onClick={() => {
              scrollToId("top");
              onNavigate();
            }}
          >
            Back to top <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
    </footer>
  );
}

export function Dialog({
  choice,
  onClose,
  dialogRef,
}: {
  choice: RecoveryChoice;
  onClose: () => void;
  dialogRef: RefObject<HTMLDivElement | null>;
}) {
  const details = recoveryChoiceDetails[choice];
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog-card"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-heading"
        aria-describedby="dialog-copy"
        tabIndex={-1}
      >
        <button type="button" className="dialog-x" onClick={onClose} aria-label="Close recovery review">
          ×
        </button>
        <span className="overline">REVIEW RECOVERY PLAN · ILLUSTRATIVE</span>
        <h2 id="dialog-heading">{details.name}</h2>
        <p id="dialog-copy">
          This is a proposal for review only. No task, assignee, deadline, or verification record
          has been changed.
        </p>
        <div className="dialog-summary">
          <span>SELECTED CHANGE</span>
          <b>{details.change}</b>
          <small>
            {details.schedule} · {details.workload}
          </small>
          <small>{details.assumption}</small>
          <small>
            Awaiting an authorized lead · revalidate the current task state before any real update.
          </small>
        </div>
        <button type="button" className="button button--blue" onClick={onClose}>
          Close review <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

export function StatusDot({ tone = "green" }: { tone?: string }) {
  return <i className={`live-dot${tone !== "green" ? ` live-dot--${tone}` : ""}`} aria-hidden="true" />;
}

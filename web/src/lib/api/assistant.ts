"use client";

/**
 * AI Work Assistant — service boundary.
 *
 * INTEGRATION STATUS (Vite migration): DEFERRED.
 * The previous implementation called a first-party Next.js route
 * (/api/ai/assistant). That server no longer exists after the migration to
 * React + Vite, and the shared FastAPI backend's verified contract
 * (docs/openapi.json) does not define any assistant endpoint. Per the
 * integration scope, assistant-specific work is therefore deferred — the
 * screen stays explorable, no live AI is generated here, and no mock content
 * is presented as AI output. When the shared backend defines its assistant
 * contract, only this module needs to change.
 *
 * Guarantees encoded in the contract:
 * - Every artifact is a DRAFT. Nothing here mutates tasks, plans, allocations,
 *   recovery decisions or statuses.
 * - The blocker-report draft hand-off is an explicit user action that only
 *   prefills the authorized "Report blocker" dialog (user still submits).
 * - Errors surface honestly; no fabricated/demo content is generated here.
 */

export const ASSISTANT_MODES = [
  {
    id: "decompose",
    label: "Task decomposition",
    description: "Break the selected task into concrete, ordered sub-steps.",
    placeholder: "e.g. How should I approach the sandbox integration? Any pitfalls?",
  },
  {
    id: "roadmap",
    label: "Personal roadmap",
    description: "A day-by-day checklist for your assigned work.",
    placeholder: "e.g. Plan my week around the 16h estimate — I have ~4h/day.",
  },
  {
    id: "research",
    label: "Research & sources",
    description: "Find prior art, references and things to verify.",
    placeholder: "e.g. What should I read up on before touching the payment flow?",
  },
  {
    id: "docs",
    label: "Documentation draft",
    description: "Draft notes, handovers or README sections from the task context.",
    placeholder: "e.g. Draft the handover notes for the payments integration.",
  },
  {
    id: "tests",
    label: "Test-case generation",
    description: "Checklists and test cases mapped to the acceptance criteria.",
    placeholder: "e.g. Generate edge cases for the retry logic.",
  },
  {
    id: "explain",
    label: "Explain & troubleshoot",
    description: "Technical explanations and debugging help.",
    placeholder: "e.g. The vendor sandbox returns 500s on idempotent retries — why?",
  },
  {
    id: "progress",
    label: "Progress summary",
    description: "Summarize progress or draft a blocker report for your lead.",
    placeholder: "e.g. Summarize where I am and draft a blocker note for my lead.",
  },
] as const;

export type AssistantMode = (typeof ASSISTANT_MODES)[number]["id"];

export function isAssistantMode(value: unknown): value is AssistantMode {
  return typeof value === "string" && ASSISTANT_MODES.some((m) => m.id === value);
}

/** Grounding context for one selected task (read-only projection of the task API). */
export interface AssistantTaskContext {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  estimateHours?: number;
  dueDate?: string;
  skills: string[];
  acceptanceCriteria: string[];
  workflowName: string;
  prerequisiteTitles: string[];
  dependentTitles: string[];
  blocker?: { title: string; severity: string; status: string } | null;
}

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantRequest {
  mode: AssistantMode;
  /** Full visible thread (oldest first). The last entry must be the new user prompt. */
  messages: AssistantTurn[];
  task: AssistantTaskContext | null;
}

export interface AssistantResponse {
  content: string;
  mode: AssistantMode;
  generatedAt: string;
  /** Always true today; reserved so a future demo/echo mode can be labeled honestly. */
  source: "ai";
}

export class AssistantError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AssistantError";
    this.status = status;
    this.code = code;
  }
}

/** Honest, user-facing deferral notice — surfaced on the assistant screen. */
export const ASSISTANT_DEFERRED_MESSAGE =
  "The AI Work Assistant is deferred: the shared FastAPI backend does not define an assistant contract yet, and the former first-party AI route was removed with the Next.js migration. No live AI is generated here.";

export async function requestAssistantHelp(req: AssistantRequest, _sessionToken: string | null): Promise<AssistantResponse> {
  if (!isAssistantMode(req.mode)) throw new AssistantError(400, "bad_mode", "Unknown assistant mode.");
  if (!req.messages.length || req.messages[req.messages.length - 1].role !== "user") {
    throw new AssistantError(400, "bad_request", "The last message must be your prompt.");
  }

  /* Deferred — see the module docblock. No Next.js AI route is called after
     the Vite migration, and the FastAPI contract has no assistant endpoint.
     Throwing an explicit error (instead of fabricating a response) keeps the
     screen honest; the UI renders this message in its error/deferred state. */
  throw new AssistantError(501, "deferred", ASSISTANT_DEFERRED_MESSAGE);
}

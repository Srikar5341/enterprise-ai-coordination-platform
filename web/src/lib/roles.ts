/**
 * Role-aware access map — single source of truth for navigation and route
 * guards. The role always comes from the authenticated session; this module is
 * a UX layer only (the backend remains authoritative and mirrors these rules).
 */
import type { UserRole } from "@/lib/api/types";

/** Where each role lands by default (login, guards, brand link). */
export const ROLE_HOME: Record<UserRole, string> = {
  team_lead: "/overview",
  employee: "/my-workspace",
};

/** Team-wide coordination & management — team-lead exclusive. */
const LEAD_ONLY_EXACT = new Set([
  "/overview",
  "/workflows",
  "/workflows/new",
  "/recovery",
  "/risks",
  "/approvals",
  "/audit",
  "/usage",
  "/team",
]);

/** Employee-focused workspace surfaces. */
const EMPLOYEE_ONLY_EXACT = new Set(["/my-workspace", "/assistant"]);

export function canAccess(role: UserRole, path: string): boolean {
  const seg = path.split("/").filter(Boolean);
  if (LEAD_ONLY_EXACT.has(path)) return role === "team_lead";
  if (seg[0] === "workflows" && seg.length >= 2) return role === "team_lead"; // /workflows/:id(…)
  if (seg[0] === "recovery" && seg.length >= 2) return role === "team_lead"; // /recovery/:id
  if (EMPLOYEE_ONLY_EXACT.has(path)) return role === "employee";
  return true; // /tasks, /tasks/:id, /settings, /subscription — shared surfaces
}

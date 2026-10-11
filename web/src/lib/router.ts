"use client";

/**
 * Hash-based router.
 *
 * The sandbox exposes a single Next.js route (/), so application "pages" live
 * under hash paths like #/overview. This gives real back/forward semantics,
 * deep links and guards without creating additional Next.js routes.
 */
import { useCallback, useEffect, useState } from "react";

export interface RouteInfo {
  /** Normalized path without the leading '#', e.g. "/workflows/wf-1/plan" */
  path: string;
  segments: string[];
  query: URLSearchParams;
  hash: string;
}

function getHash(): string {
  if (typeof window === "undefined") return "/";
  const h = window.location.hash.replace(/^#/, "");
  return h.startsWith("/") ? h : h ? `/${h}` : "/";
}

export function parseRoute(hash: string): RouteInfo {
  const [pathPart, queryPart] = hash.split("?");
  const path = pathPart.replace(/\/+$/, "") || "/";
  const [, ...segments] = path.split("/");
  return {
    path,
    segments,
    query: new URLSearchParams(queryPart ?? ""),
    hash,
  };
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const target = to.startsWith("/") ? to : `/${to}`;
  if (opts.replace) {
    window.history.replaceState(null, "", `#${target}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target;
  }
}

export function useHashRoute(): RouteInfo {
  const [route, setRoute] = useState<RouteInfo>(() => parseRoute(getHash()));

  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(getHash()));
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}

/** Anchor that plays nicely with the hash router (still keyboard accessible). */
export function useNavigateCallback() {
  return useCallback((to: string) => navigate(to), []);
}

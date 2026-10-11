"use client";

/**
 * Branded 404 view. Rendered inside the AppShell for unknown app routes and
 * standalone for unknown public routes, so it keeps its own compact layout.
 */
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Compass, Home, LayoutDashboard } from "lucide-react";
import { navigate } from "@/lib/router";
import { M3Button } from "../primitives";

export default function NotFoundPage({ path }: { path?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <section
      aria-labelledby="notfound-title"
      className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center"
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        className="flex w-full max-w-lg flex-col items-center"
      >
        <div className="mb-6 flex size-16 items-center justify-center rounded-[20px] bg-secondary text-secondary-foreground">
          <Compass className="size-8" aria-hidden />
        </div>

        <p aria-hidden className="text-display-md font-black leading-none tracking-tight text-primary/90">
          404
        </p>
        <h1 id="notfound-title" className="sr-only">Page not found</h1>

        <p className="mt-4 text-title-lg font-semibold">That view doesn&apos;t exist</p>
        <p className="mt-2 max-w-sm text-label-lg text-on-surface-variant">
          The address may have been mistyped, or the view was moved in this demo build.
        </p>

        {path ? (
          <code className="mt-5 max-w-full truncate rounded-full bg-surface-container-high px-4 py-2 font-mono text-label-md text-on-surface-variant ring-1 ring-outline-variant">
            #{path}
          </code>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <M3Button onClick={() => navigate("/overview")}>
            <LayoutDashboard className="size-4" aria-hidden />
            Go to Overview
          </M3Button>
          <M3Button variant="outlined" onClick={() => navigate("/")}>
            <Home className="size-4" aria-hidden />
            Back to landing
          </M3Button>
        </div>
      </motion.div>
    </section>
  );
}

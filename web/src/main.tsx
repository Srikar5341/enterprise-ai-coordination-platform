import { createRoot } from "react-dom/client";
import "./index.css";
import "./landing.css";
import App from "./App";

/**
 * React + Vite entry point (replaces the Next.js app router bootstrap).
 * All product surfaces (marketing, auth, onboarding, team-lead app,
 * employee workspace) render through the hash router inside <App />.
 */
// react-refresh/react-tree keeps a single root; no StrictMode to mirror the
// previous Next.js configuration (reactStrictMode: false).
createRoot(document.getElementById("root")!).render(<App />);

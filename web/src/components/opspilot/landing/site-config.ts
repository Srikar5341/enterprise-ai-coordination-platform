/**
 * Public landing configuration.
 *
 * APP_URL — point this at the real product application once it is hosted at a
 * dedicated URL (e.g. "https://app.renova.dev"). While it is null, every
 * primary CTA ("Get Started") links to the local account creation page
 * (#/register), which creates an account in this demo environment (sample
 * data, clearly labeled on the auth screens).
 *
 * Demo sign-in was removed from the landing page per product decision — the
 * landing page funnels everyone through account creation. Existing demo users
 * can still reach the sign-in screen at #/login from the auth pages.
 *
 * See LANDING_PAGE_AUDIT.md (section B) for the full rationale.
 */
export const APP_URL: string | null = null;

/** Account creation page (local hash route) used by "Get Started" while APP_URL is null. */
export const APP_SIGN_UP_URL = "#/register";

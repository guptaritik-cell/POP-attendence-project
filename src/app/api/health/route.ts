import { NextResponse } from "next/server";

/**
 * Health-check endpoint — shows which env vars are configured (values masked).
 * Visit /api/health on your deployed URL to diagnose missing env vars.
 */
export async function GET() {
  const vars = {
    GOOGLE_SHEET_ID:              !!process.env.GOOGLE_SHEET_ID,
    GOOGLE_OAUTH_CLIENT_ID:       !!process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET:   !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REFRESH_TOKEN:   !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    NEXTAUTH_SECRET:              !!process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL:                 process.env.NEXTAUTH_URL ?? "NOT SET",
    ADMIN_EMAIL:                  !!process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD:               !!process.env.ADMIN_PASSWORD,
  };

  const missing = Object.entries(vars)
    .filter(([, v]) => v === false)
    .map(([k]) => k);

  return NextResponse.json({
    status: missing.length === 0 ? "ok" : "missing_vars",
    missing,
    configured: vars,
  });
}

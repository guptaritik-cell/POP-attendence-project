/**
 * GET /api/employees/debug-write
 *
 * Temporary diagnostic endpoint — tests Sheets write permission and tab list.
 * DELETE this file once the issue is resolved.
 */
import { NextResponse } from "next/server";
import { google } from "googleapis";

function getAuth() {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing OAuth2 env vars");
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export async function GET() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    return NextResponse.json({ error: "GOOGLE_SHEET_ID not set" }, { status: 500 });
  }

  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const result: Record<string, unknown> = {};

  // 1. List tabs
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    result.tabs = (meta.data.sheets ?? []).map(s => s.properties?.title);
    result.tabsOk = true;
  } catch (err: unknown) {
    result.tabsOk = false;
    result.tabsError = extractMessage(err);
  }

  // 2. Try a test write to the first tab (appends then immediately undone via clear)
  const firstTab = Array.isArray(result.tabs) && result.tabs[0];
  if (firstTab) {
    try {
      const appendRes = await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${firstTab}!A:A`,
        valueInputOption: "RAW",
        requestBody: { values: [["__debug_test__"]] },
      });
      result.writeOk = true;
      result.updatedRange = appendRes.data.updates?.updatedRange;

      // Try to clear the test row immediately
      const updatedRange = appendRes.data.updates?.updatedRange ?? "";
      if (updatedRange) {
        await sheets.spreadsheets.values.clear({
          spreadsheetId: sheetId,
          range: updatedRange,
        });
        result.cleanedUp = true;
      }
    } catch (err: unknown) {
      result.writeOk = false;
      result.writeError = extractMessage(err);
      result.writeErrorFull = String(err);
    }
  }

  return NextResponse.json(result, { status: 200 });
}

function extractMessage(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as Record<string, unknown>;
  const resp = e.response as { data?: { error?: { message?: string; status?: string } } } | undefined;
  if (resp?.data?.error?.message) {
    return `${resp.data.error.status ?? ""}: ${resp.data.error.message}`;
  }
  if (typeof e.message === "string") return e.message;
  return String(err);
}

// Shared holiday date helpers (server + client safe — no Node-only imports).

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

const pad = (n: number) => String(n).padStart(2, "0");

function validYMD(y: number, m: number, d: number): string | null {
  if (!y || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Parses a holiday date into ISO "YYYY-MM-DD". Accepts:
//   • "DD-MMM-YYYY" (sheet format, e.g. "01-Jan-2026"; also "1 Jan 2026", "1/Jan/2026")
//   • "YYYY-MM-DD" (from <input type="date">)
//   • Excel serial numbers (when Excel auto-converts the cell to a date)
// Returns null when the value isn't a valid date.
export function parseHolidayDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial: days since 1899-12-30. Round to the nearest whole day —
    // date-only cells can carry a small fraction from timezone conversion.
    const ms = (Math.round(value) - 25569) * 86400 * 1000;
    const dt = new Date(ms);
    return validYMD(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return validYMD(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const s = String(value ?? "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validYMD(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,})[-\s/,]*(\d{4})$/);
  if (m) {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mon === -1) return null;
    return validYMD(+m[3], mon + 1, +m[1]);
  }
  return null;
}

// ISO "YYYY-MM-DD" → "01-Jan-2026"
export function formatHolidayDate(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  if (!y || !mo || !d) return iso;
  const mon = MONTHS[mo - 1];
  return `${pad(d)}-${mon[0].toUpperCase()}${mon.slice(1)}-${y}`;
}

// ISO "YYYY-MM-DD" → weekday name ("Thursday")
export function holidayWeekday(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

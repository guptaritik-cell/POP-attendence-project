// Styled one-page Excel attendance report (Report + Data tabs, native charts).
//
// The workbook is written as raw OOXML and zipped with the CFB/zip writer that
// ships inside the `xlsx` package, so no extra dependency is needed.
//
//   • Data tab   — mirrors the summary CSV line for line in A1:B41 with real
//                  numbers / dates / times / percentages, plus a derived block,
//                  a reuse note and a "How it's calculated" block.
//   • Report tab — every value is an INDEX/MATCH formula that looks the Data
//                  tab up by label, so pasting another employee's CSV over
//                  Data!A1 refreshes the whole page. Cached results are written
//                  too, so the file looks right before Excel recalculates.
//   • Team / Master reports add an "Employees" tab (and "Teams" for Master).
import * as XLSX from "xlsx";
import { SYMBOL_META } from "@/lib/attendanceSymbols";
import { calculationRows } from "@/lib/summaryCalc";

// ── Input ────────────────────────────────────────────────────────────────────
export interface ReportSummary {
  present: number;
  wfh: number;
  absent: number;
  halfDay: number;
  leaves: Record<string, number> & { total: number };
  weekOff: number;
  holiday: number;
  workingDays: number;
  attendancePercent: number; // 0-100
  wfhPercent: number;        // 0-100
}
export interface ReportTime {
  totalHours: string;
  totalMinutes: number;
  avgHoursPerDay: string;     // "7h 56m"
  avgClockIn: string | null;  // "10:48"
  avgClockOut: string | null;
  lateArrivals: number;
  earlyDepartures: number;
  overtimeHours: string;      // "4h 36m"
  overtimeMinutes?: number;
  punctualityPercent: number; // 0-100
  daysWithData: number;
}
export interface ReportEmployeeRow {
  employee: { employeeId: string; name: string; team: string; buLead: string };
  summary: ReportSummary;
  totalMinutes: number;
  avgHoursPerDay: string | null;
  lateArrivals: number;
}
export interface ReportTeamRow {
  team: string;
  employeeCount: number;
  summary: ReportSummary;
  timeMetrics: { totalMinutes: number } | null;
}
export interface ReportInput {
  kind: "employee" | "team" | "master";
  /** Single: employee. Team / Master: header identity values. */
  identity: { id: string; name: string; team: string; buLead: string };
  range: { from: string; to: string; label: string }; // ISO dates
  summary: ReportSummary;
  timeMetrics: ReportTime | null;
  employees?: ReportEmployeeRow[];
  teams?: ReportTeamRow[];
}

// ── Palette (one colour per meaning) ─────────────────────────────────────────
const NAVY  = "1F3864";
const GREEN = "2E7D32";
const BLUE  = "1976D2";
const TEAL  = "26A69A";
const AMBER = "E09B00";
const AMBER_CHART = "F9A825";
const RED   = "C62828";
const GREY  = "595959";
const TILE  = "F3F6FA";
const OBS   = "FAFAFA";
const TOTAL = "DCE6F1";
const LINE  = "BFBFBF";
const SUB   = "D9E2F3";
const WHITE = "FFFFFF";

const LEAVE_CODES = Object.values(SYMBOL_META).filter(m => m.category === "leave").map(m => m.code);
const leaveLabel = (code: string) => `${SYMBOL_META[code as keyof typeof SYMBOL_META].fullName} (${code})`;

// ── Small helpers ────────────────────────────────────────────────────────────
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function colLetter(n: number): string { // 1-based
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function colNum(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function splitRef(ref: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
  return { col: colNum(m[1]), row: +m[2] };
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function isoToSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}
function hhmmToMin(s: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((s ?? "").trim());
  return m ? +m[1] * 60 + +m[2] : null;
}
function durToMin(s: string | null | undefined): number {
  const m = /(\d+)h\s*(\d+)m/.exec(s ?? "");
  return m ? +m[1] * 60 + +m[2] : 0;
}
const fmtDur = (min: number) => { const t = Math.round(min); return `${Math.floor(t / 60)}h ${String(t % 60).padStart(2, "0")}m`; };
const fmtHHMM = (min: number) => { const t = Math.round(min); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const fmtPct1 = (frac: number) => `${(Math.round(frac * 1000) / 10).toFixed(1)}%`;

// ── Styles registry ──────────────────────────────────────────────────────────
interface FontDef { sz?: number; b?: boolean; i?: boolean; color?: string }
interface Edge { style: "thin" | "medium" | "thick"; color: string }
interface BorderDef { left?: Edge; right?: Edge; top?: Edge; bottom?: Edge }
export interface StyleDef {
  font?: FontDef;
  fill?: string;
  border?: BorderDef;
  h?: "left" | "center" | "right";
  v?: "top" | "center" | "bottom";
  wrap?: boolean;
  indent?: number;
  numFmt?: string;
}

class Styles {
  private fonts: string[] = ['<font><sz val="10"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/></font>'];
  private fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  private numFmts: string[] = [];
  private xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private cache = new Map<string, number>();
  private dxfs: string[] = [];

  private idx(arr: string[], xml: string): number {
    const i = arr.indexOf(xml);
    if (i >= 0) return i;
    arr.push(xml);
    return arr.length - 1;
  }

  get(def: StyleDef): number {
    const key = JSON.stringify(def);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    const f = def.font ?? {};
    const fontXml = `<font>${f.b ? "<b/>" : ""}${f.i ? "<i/>" : ""}<sz val="${f.sz ?? 10}"/><color rgb="FF${f.color ?? "000000"}"/><name val="Arial"/><family val="2"/></font>`;
    const fontId = this.idx(this.fonts, fontXml);
    const fillId = def.fill
      ? this.idx(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${def.fill}"/><bgColor indexed="64"/></patternFill></fill>`)
      : 0;
    const b = def.border;
    const edge = (n: string, e?: Edge) => (e ? `<${n} style="${e.style}"><color rgb="FF${e.color}"/></${n}>` : `<${n}/>`);
    const borderId = b
      ? this.idx(this.borders, `<border>${edge("left", b.left)}${edge("right", b.right)}${edge("top", b.top)}${edge("bottom", b.bottom)}<diagonal/></border>`)
      : 0;
    let numFmtId = 0;
    if (def.numFmt) {
      const builtin: Record<string, number> = { "0": 1, "0.00": 2, "0%": 9, "0.00%": 10 };
      numFmtId = builtin[def.numFmt] ?? 164 + this.idx(this.numFmts, def.numFmt);
    }
    const align = def.h || def.v || def.wrap || def.indent
      ? `<alignment${def.h ? ` horizontal="${def.h}"` : ""} vertical="${def.v ?? "center"}"${def.wrap ? ' wrapText="1"' : ""}${def.indent ? ` indent="${def.indent}"` : ""}/>`
      : "";
    const xf = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      `${numFmtId ? ' applyNumberFormat="1"' : ""} applyFont="1"${fillId ? ' applyFill="1"' : ""}${borderId ? ' applyBorder="1"' : ""}` +
      (align ? ` applyAlignment="1">${align}</xf>` : "/>");
    this.xfs.push(xf);
    const id = this.xfs.length - 1;
    this.cache.set(key, id);
    return id;
  }

  dxf(font: FontDef, fill?: string): number {
    this.dxfs.push(
      `<dxf><font>${font.b ? "<b/>" : ""}<color rgb="FF${font.color ?? "000000"}"/></font>` +
      (fill ? `<fill><patternFill patternType="solid"><bgColor rgb="FF${fill}"/></patternFill></fill>` : "") +
      `</dxf>`,
    );
    return this.dxfs.length - 1;
  }

  xml(): string {
    const nf = this.numFmts.length
      ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join("")}</numFmts>`
      : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${nf}` +
      `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join("")}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join("")}</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `<dxfs count="${this.dxfs.length}">${this.dxfs.join("")}</dxfs>` +
      `</styleSheet>`;
  }
}

// ── Sheet builder ────────────────────────────────────────────────────────────
type Val = string | number | boolean | null;
interface CellDef { v?: Val; f?: string; s?: number }

class Sheet {
  cells = new Map<string, CellDef>();
  merges: string[] = [];
  rowHeights = new Map<number, number>();
  cols: { min: number; max: number; width: number }[] = [];
  cond: string[] = [];
  extra = { drawingRid: "", gridlines: true, fitToPage: false, printArea: "", freezeRow: 0 };

  constructor(public name: string, private st: Styles) {}

  set(ref: string, c: CellDef) {
    this.cells.set(ref, { ...this.cells.get(ref), ...c });
  }
  /** Value (or formula + cached value) in the top-left cell, style over the whole range, merged. */
  put(range: string, c: CellDef & { style?: StyleDef }) {
    const [a, b] = range.split(":");
    const s = c.style ? this.st.get(c.style) : c.s;
    if (b) this.fill(range, c.style ?? {});
    this.set(a, { v: c.v, f: c.f, s });
    if (b) this.merges.push(range);
  }
  /** Style every cell in a range. */
  fill(range: string, style: StyleDef) {
    const [a, b] = range.split(":");
    const p = splitRef(a), q = splitRef(b ?? a);
    const s = this.st.get(style);
    for (let r = p.row; r <= q.row; r++) {
      for (let c = p.col; c <= q.col; c++) {
        const ref = `${colLetter(c)}${r}`;
        this.cells.set(ref, { ...this.cells.get(ref), s });
      }
    }
  }
  /** Style a range where each cell's border depends on its position (tile edges). */
  box(range: string, base: StyleDef, edges: { left?: Edge; right?: Edge; top?: Edge; bottom?: Edge }) {
    const [a, b] = range.split(":");
    const p = splitRef(a), q = splitRef(b ?? a);
    for (let r = p.row; r <= q.row; r++) {
      for (let c = p.col; c <= q.col; c++) {
        const border: BorderDef = { ...base.border };
        if (c === p.col && edges.left) border.left = edges.left;
        if (c === q.col && edges.right) border.right = edges.right;
        if (r === p.row && edges.top) border.top = edges.top;
        if (r === q.row && edges.bottom) border.bottom = edges.bottom;
        const ref = `${colLetter(c)}${r}`;
        this.cells.set(ref, { ...this.cells.get(ref), s: this.st.get({ ...base, border }) });
      }
    }
  }
  height(row: number, pt: number) { this.rowHeights.set(row, pt); }
  width(col: number, w: number, max = col) { this.cols.push({ min: col, max, width: w }); }

  xml(): string {
    const rows = new Map<number, [number, string, CellDef][]>();
    let maxRow = 1, maxCol = 1;
    for (const [ref, c] of this.cells) {
      const { col, row } = splitRef(ref);
      maxRow = Math.max(maxRow, row); maxCol = Math.max(maxCol, col);
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row)!.push([col, ref, c]);
    }
    for (const r of this.rowHeights.keys()) if (!rows.has(r)) rows.set(r, []);

    const rowXml = [...rows.keys()].sort((a, b) => a - b).map(r => {
      const ht = this.rowHeights.get(r);
      const cells = rows.get(r)!.sort((a, b) => a[0] - b[0]).map(([, ref, c]) => cellXml(ref, c)).join("");
      return `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>${cells}</row>`;
    }).join("");

    const sheetPr = this.extra.fitToPage ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : "";
    const pane = this.extra.freezeRow
      ? `<pane ySplit="${this.extra.freezeRow}" topLeftCell="A${this.extra.freezeRow + 1}" activePane="bottomLeft" state="frozen"/>`
      : "";
    const views = `<sheetViews><sheetView${this.extra.gridlines ? "" : ' showGridLines="0"'} workbookViewId="0">${pane}</sheetView></sheetViews>`;
    const cols = this.cols.length
      ? `<cols>${this.cols.map(c => `<col min="${c.min}" max="${c.max}" width="${c.width}" customWidth="1"/>`).join("")}</cols>`
      : "";
    const merges = this.merges.length
      ? `<mergeCells count="${this.merges.length}">${this.merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
      : "";
    const page = this.extra.fitToPage
      ? '<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>' +
        '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="1"/>'
      : '<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>';
    const drawing = this.extra.drawingRid ? `<drawing r:id="${this.extra.drawingRid}"/>` : "";

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `${sheetPr}<dimension ref="A1:${colLetter(maxCol)}${maxRow}"/>${views}<sheetFormatPr defaultRowHeight="15"/>${cols}` +
      `<sheetData>${rowXml}</sheetData>${merges}${this.cond.join("")}${page}${drawing}</worksheet>`;
  }
}

function cellXml(ref: string, c: CellDef): string {
  const s = c.s ? ` s="${c.s}"` : "";
  const v = c.v;
  if (c.f !== undefined) {
    const f = `<f>${esc(c.f)}</f>`;
    if (typeof v === "number") return `<c r="${ref}"${s}>${f}<v>${v}</v></c>`;
    if (typeof v === "boolean") return `<c r="${ref}"${s} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
    return `<c r="${ref}"${s} t="str">${f}<v>${esc(String(v ?? ""))}</v></c>`;
  }
  if (v === undefined || v === null || v === "") return `<c r="${ref}"${s}/>`;
  if (typeof v === "number") return `<c r="${ref}"${s}><v>${v}</v></c>`;
  if (typeof v === "boolean") return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

// ── Charts ───────────────────────────────────────────────────────────────────
const C_NS = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const solid = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
const txPr = (sz: number, bold = false, color = "404040") =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}">${solid(color)}<a:latin typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
const title = (text: string) =>
  `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1">${solid(NAVY)}<a:latin typeface="Arial"/></a:defRPr></a:pPr>` +
  `<a:r><a:rPr lang="en-US" sz="1100" b="1">${solid(NAVY)}<a:latin typeface="Arial"/></a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
const strRef = (f: string, vals: string[]) =>
  `<c:strRef><c:f>${esc(f)}</c:f><c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join("")}</c:strCache></c:strRef>`;
const numRef = (f: string, vals: number[]) =>
  `<c:numRef><c:f>${esc(f)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("")}</c:numCache></c:numRef>`;
const chartFrame = (plot: string, legendPos: "r" | "b") =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace ${C_NS}><c:roundedCorners val="0"/><c:chart>${plot}` +
  `<c:legend><c:legendPos val="${legendPos}"/><c:overlay val="0"/>${txPr(900)}</c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
  `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900)}</c:chartSpace>`;

function doughnutXml(cats: string[], vals: number[], colors: string[], catRef: string, valRef: string): string {
  const dpts = colors.map((c, i) =>
    `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${solid(c)}<a:ln w="19050">${solid(WHITE)}</a:ln></c:spPr></c:dPt>`).join("");
  const plot = `${title("Working days by status")}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:doughnutChart><c:varyColors val="1"/>` +
    `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Days</c:v></c:tx>${dpts}` +
    `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, true, WHITE)}<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>` +
    `<c:cat>${strRef(catRef, cats)}</c:cat><c:val>${numRef(valRef, vals)}</c:val></c:ser>` +
    `<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart><c:spPr><a:noFill/></c:spPr></c:plotArea>`;
  return chartFrame(plot, "r");
}

function stackedBarXml(
  cats: string[], catRef: string,
  series: { name: string; nameRef: string; color: string; ref: string; vals: number[]; labelColor: string }[],
): string {
  const ser = series.map((s, i) =>
    `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx>${strRef(s.nameRef, [s.name])}</c:tx><c:spPr>${solid(s.color)}</c:spPr><c:invertIfNegative val="0"/>` +
    `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, true, s.labelColor)}<c:dLblPos val="ctr"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>` +
    `<c:cat>${strRef(catRef, cats)}</c:cat><c:val>${numRef(s.ref, s.vals)}</c:val></c:ser>`).join("");
  const plot = `${title("Arrivals and departures: on time vs late / early (days)")}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>` +
    `<c:barChart><c:barDir val="bar"/><c:grouping val="percentStacked"/><c:varyColors val="0"/>${ser}<c:gapWidth val="60"/><c:overlap val="100"/><c:axId val="5001"/><c:axId val="5002"/></c:barChart>` +
    `<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="maxMin"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln>${solid(LINE)}</a:ln></c:spPr>${txPr(900)}<c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/><c:max val="1"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="t"/><c:majorGridlines><c:spPr><a:ln>${solid("E5E5E5")}</a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="0%" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(800)}<c:crossAx val="5001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/><c:majorUnit val="0.25"/></c:valAx>` +
    `<c:spPr><a:noFill/></c:spPr></c:plotArea>`;
  return chartFrame(plot, "b");
}

function drawingXml(anchors: { from: [number, number]; to: [number, number]; rid: string; id: number; name: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    anchors.map(a =>
      `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${a.from[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.from[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
      `<xdr:to><xdr:col>${a.to[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.to[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
      `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${a.id}" name="${a.name}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
      `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
      `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${a.rid}"/>` +
      `</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`).join("") +
    `</xdr:wsDr>`;
}

// ── Workbook ─────────────────────────────────────────────────────────────────
export function buildReportWorkbook(input: ReportInput): Uint8Array {
  const st = new Styles();
  const { summary: s, timeMetrics: t, range, identity } = input;
  const isGroup = input.kind !== "employee";

  // ── Data values (mirrors the CSV, typed) ──────────────────────────────────
  const fromSerial = isoToSerial(range.from);
  const toSerial   = isoToSerial(range.to);
  const clocked    = t?.daysWithData ?? 0;
  const totalMin   = t?.totalMinutes ?? 0;
  const avgMin     = durToMin(t?.avgHoursPerDay);
  const inMin      = hhmmToMin(t?.avgClockIn);
  const outMin     = hhmmToMin(t?.avgClockOut);
  const late       = t?.lateArrivals ?? 0;
  const early      = t?.earlyDepartures ?? 0;
  const punct      = (t?.punctualityPercent ?? 0) / 100;
  const otMin      = t?.overtimeMinutes ?? durToMin(t?.overtimeHours);
  const wd         = s.workingDays;
  const att        = s.attendancePercent / 100;
  const wfhPct     = s.wfhPercent / 100;
  const calendarDays = toSerial - fromSerial + 1;
  // Team / Master: compare person-days (calendar days × employees)
  const headcount    = Number(identity.id) || 1;
  const calendarTotal = isGroup ? calendarDays * headcount : calendarDays;

  const idLabel = isGroup ? "Employees" : "Employee ID";
  const title1  = input.kind === "employee" ? "Employee Summary" : input.kind === "team" ? "Team Summary" : "Master Summary";

  // ── Data sheet ────────────────────────────────────────────────────────────
  const data = new Sheet("Data", st);
  data.width(1, 27.2); data.width(2, 33.2); data.width(3, 2.2); data.width(4, 26); data.width(5, 58); data.width(6, 34); data.width(7, 14);
  data.extra.gridlines = true;

  const S = {
    label:   st.get({ font: { sz: 10 } }),
    bold:    st.get({ font: { sz: 10, b: true } }),
    title:   st.get({ font: { sz: 12, b: true, color: NAVY } }),
    hdr:     st.get({ font: { sz: 10, b: true, color: WHITE }, fill: NAVY }),
    num:     st.get({ font: { sz: 10, color: "0000FF" }, h: "right" }),
    txt:     st.get({ font: { sz: 10, color: "0000FF" } }),
    pct:     st.get({ font: { sz: 10, color: "0000FF" }, h: "right", numFmt: "0.0%" }),
    date:    st.get({ font: { sz: 10, color: "0000FF" }, h: "right", numFmt: "dd-mmm-yyyy" }),
    time:    st.get({ font: { sz: 10, color: "0000FF" }, h: "right", numFmt: "hh:mm" }),
    dur:     st.get({ font: { sz: 10, color: "0000FF" }, h: "right", numFmt: '[h]\\h\\ mm\\m' }),
    note:    st.get({ font: { sz: 9, i: true, color: GREY } }),
    noteW:   st.get({ font: { sz: 9, i: true, color: GREY }, wrap: true, v: "top" }),
    derived: st.get({ font: { sz: 10 }, h: "right" }),
    wrapTop: st.get({ font: { sz: 9 }, wrap: true, v: "top" }),
  };

  const dRow: [string, Val, number][] = [
    [title1, null, S.title],
    ["", null, S.label],
    [idLabel, isGroup ? Number(identity.id) || identity.id : identity.id, isGroup ? S.num : S.txt],
    ["Name", identity.name, S.txt],
    ["Team", identity.team, S.txt],
    ["BU Lead", identity.buLead, S.txt],
    ["Date Range", range.label, S.txt],
    ["From", fromSerial, S.date],
    ["To", toSerial, S.date],
    ["", null, S.label],
    ["Metric", "Value", S.bold],
    ["Present", s.present, S.num],
    ["WFH", s.wfh, S.num],
    ["WFH %", wfhPct, S.pct],
    ["Half Days", s.halfDay, S.num],
    ["Absent", s.absent, S.num],
    ...LEAVE_CODES.map(c => [leaveLabel(c), s.leaves[c] ?? 0, S.num] as [string, Val, number]),
    ["Total Leaves", s.leaves.total, S.num],
    ["Week Offs", s.weekOff, S.num],
    ["Holidays", s.holiday, S.num],
    ["Working Days", wd, S.num],
    ["Attendance %", att, S.pct],
    ["", null, S.label],
    ["Time & Punctuality", `(based on ${clocked} days with clock data)`, S.txt],
    ["Total Hours", totalMin / 1440, S.dur],
    ["Avg Hours / Day", avgMin / 1440, S.dur],
    ["Avg Clock-In", inMin === null ? "—" : inMin / 1440, inMin === null ? S.txt : S.time],
    ["Avg Clock-Out", outMin === null ? "—" : outMin / 1440, outMin === null ? S.txt : S.time],
    ["Late Arrivals", late, S.num],
    ["Early Departures", early, S.num],
    ["Punctuality %", punct, S.pct],
    ["Overtime", otMin / 1440, S.dur],
  ];
  if (dRow.length !== 41) throw new Error(`Data block must be 41 rows, got ${dRow.length}`);
  dRow.forEach(([label, value, style], i) => {
    const r = i + 1;
    const labelStyle = i === 0 ? S.title : label === "Metric" || label === "Time & Punctuality" ? S.bold : S.label;
    if (label) data.set(`A${r}`, { v: label, s: labelStyle });
    if (value !== null) data.set(`B${r}`, { v: value, s: style });
  });

  const L = (label: string) => `INDEX(Data!$B$1:$B$60,MATCH("${label}",Data!$A$1:$A$60,0))`;
  const DL = (label: string) => `INDEX($B$1:$B$60,MATCH("${label}",$A$1:$A$60,0))`;

  // Derived block
  data.set("D1", { v: "Derived (formulas, don't overwrite)", s: S.bold });
  data.set("D2", { v: "Days with clock data", s: S.label });
  data.set("E2", {
    f: `VALUE(MID(${DL("Time & Punctuality")},11,FIND(" days",${DL("Time & Punctuality")})-11))`,
    v: clocked, s: S.derived,
  });
  data.set("E4", { v: "On time / Normal", s: S.bold });
  data.set("F4", { v: "Late / Early", s: S.bold });
  data.set("D5", { v: "Arrivals", s: S.label });
  data.set("E5", { f: `E2-${DL("Late Arrivals")}`, v: clocked - late, s: S.derived });
  data.set("F5", { f: DL("Late Arrivals"), v: late, s: S.derived });
  data.set("D6", { v: "Departures", s: S.label });
  data.set("E6", { f: `E2-${DL("Early Departures")}`, v: clocked - early, s: S.derived });
  data.set("F6", { f: DL("Early Departures"), v: early, s: S.derived });

  data.set("D9", { v: "HOW TO REUSE FOR ANOTHER EMPLOYEE", s: S.bold });
  data.set("D10", { v: "Export the employee's summary CSV, open it in Excel, copy its cells A1:B41 and paste over A1 on this tab.", s: S.note });
  data.set("D11", { v: "Keep the same row order. The Report tab updates by itself (it looks every value up by its label in column A).", s: S.note });

  // How it's calculated
  const calc = calculationRows(s, t ? { ...t, overtimeHours: t.overtimeHours } : null);
  data.put("D13:G13", { v: "HOW IT'S CALCULATED", style: { font: { sz: 10, b: true, color: WHITE }, fill: NAVY, h: "left" } });
  ["Metric", "Formula", "Calculation", "Result"].forEach((h, i) =>
    data.set(`${colLetter(4 + i)}14`, { v: h, s: st.get({ font: { sz: 10, b: true }, fill: TOTAL, border: { bottom: { style: "thin", color: LINE } } }) }));
  calc.forEach((row, i) => {
    const r = 15 + i;
    data.set(`D${r}`, { v: row[0], s: st.get({ font: { sz: 9, b: true }, wrap: true, v: "top" }) });
    data.set(`E${r}`, { v: row[1], s: S.wrapTop });
    data.set(`F${r}`, { v: row[2], s: S.wrapTop });
    data.set(`G${r}`, { v: row[3], s: st.get({ font: { sz: 9, b: true }, h: "right", v: "top" }) });
    data.height(r, row[1].length > 60 ? 26 : 14);
  });
  const notesStart = 15 + calc.length + 1;
  const notes = [
    "Week offs, holidays (NHD), inactive (IN) and blank / future days are excluded from Working Days.",
    "Half Days count as one working day but half an attended day.",
    "Late = Clock In after 10:00; Early departure = Clock Out before 19:00 (standard day 10:00–19:00, 9h).",
  ];
  data.put(`D${notesStart}:G${notesStart}`, { v: "Notes", style: { font: { sz: 9, b: true, color: NAVY } } });
  notes.forEach((n, i) => data.put(`D${notesStart + 1 + i}:G${notesStart + 1 + i}`, { v: `•  ${n}`, style: { font: { sz: 9, i: true, color: GREY } } }));

  // ── Report sheet ──────────────────────────────────────────────────────────
  const rep = new Sheet("Report", st);
  rep.extra.gridlines = false;
  rep.extra.fitToPage = true;
  rep.width(1, 1.2); rep.width(2, 10.7, 13); rep.width(14, 1.2);

  const heights: Record<number, number> = {
    1: 6, 2: 40, 3: 22, 4: 8, 5: 22, 6: 36, 7: 18, 8: 8, 9: 20, 10: 28, 11: 28, 12: 28, 13: 8, 14: 20,
    15: 22, 16: 18, 17: 18, 18: 18, 19: 18, 20: 18, 21: 18, 22: 8, 23: 18, 24: 18, 25: 18, 26: 18, 27: 18, 28: 18,
    29: 8, 30: 20, 31: 22, 32: 30, 33: 16, 34: 6, 35: 22, 36: 30, 37: 16, 38: 8,
    39: 16, 40: 16, 41: 16, 42: 16, 43: 16, 44: 16, 45: 16, 46: 16, 47: 16, 48: 16, 49: 8,
    50: 20, 51: 18, 52: 18, 53: 18, 54: 18, 55: 18, 56: 18,
  };
  for (const [r, h] of Object.entries(heights)) rep.height(+r, h);

  const section = (row: number, text: string, f?: string) =>
    rep.put(`B${row}:M${row}`, { v: text, f, style: { font: { sz: 10, b: true, color: WHITE }, fill: NAVY, h: "left", indent: 1 } });

  // Header band
  const periodCached = (() => {
    const [fy, fm, fd] = range.from.split("-").map(Number);
    const [ty, tm, td] = range.to.split("-").map(Number);
    return fy === ty && fm === tm
      ? `${MONTHS[fm - 1]} ${fd} – ${td}, ${ty}`
      : `${MONTHS[fm - 1].slice(0, 3)} ${fd}, ${fy} – ${MONTHS[tm - 1].slice(0, 3)} ${td}, ${ty}`;
  })();
  rep.fill("A1:N1", { fill: NAVY });
  rep.fill("A2:A3", { fill: NAVY }); rep.fill("N2:N3", { fill: NAVY }); rep.fill("A4:N4", {});
  rep.put("B2:I2", { f: L("Name"), v: identity.name, style: { font: { sz: 22, b: true, color: WHITE }, fill: NAVY, h: "left" } });
  rep.put("J2:M2", {
    f: `IF(TEXT(${L("From")},"yyyymm")=TEXT(${L("To")},"yyyymm"),TEXT(${L("From")},"mmmm d")&" – "&TEXT(${L("To")},"d, yyyy"),TEXT(${L("From")},"mmm d, yyyy")&" – "&TEXT(${L("To")},"mmm d, yyyy"))`,
    v: periodCached,
    style: { font: { sz: 12, b: true, color: WHITE }, fill: NAVY, h: "right" },
  });
  const kindText = input.kind === "employee" ? "Attendance summary" : input.kind === "team" ? "Team attendance summary" : "Company attendance summary";
  const infoCached = `${idLabel}: ${identity.id}     |     Team: ${identity.team}     |     BU Lead: ${identity.buLead}     |     ${kindText}`;
  rep.put("B3:M3", {
    f: `"${idLabel}: "&${L(idLabel)}&"     |     Team: "&${L("Team")}&"     |     BU Lead: "&${L("BU Lead")}&"     |     ${kindText}"`,
    v: infoCached,
    style: { font: { sz: 10, color: SUB }, fill: NAVY, h: "left" },
  });

  // KPI tiles
  const white: Edge = { style: "medium", color: WHITE };
  const tile = (
    c1: string, c2: string, color: string, label: string,
    value: { f: string; v: Val; numFmt?: string }, caption: { f: string; v: Val },
  ) => {
    const edges = { left: white, right: white };
    rep.box(`${c1}5:${c2}5`, { font: { sz: 8, b: true, color: GREY }, fill: TILE, h: "center" }, { ...edges, top: { style: "thick", color } });
    rep.box(`${c1}6:${c2}6`, { font: { sz: 22, b: true, color }, fill: TILE, h: "center", numFmt: value.numFmt }, edges);
    rep.box(`${c1}7:${c2}7`, { font: { sz: 8, color: GREY }, fill: TILE, h: "center" }, edges);
    rep.set(`${c1}5`, { v: label }); rep.merges.push(`${c1}5:${c2}5`);
    rep.set(`${c1}6`, { f: value.f, v: value.v }); rep.merges.push(`${c1}6:${c2}6`);
    rep.set(`${c1}7`, { f: caption.f, v: caption.v }); rep.merges.push(`${c1}7:${c2}7`);
  };
  const absentPct = wd > 0 ? s.absent / wd : 0;
  tile("B", "C", GREEN, "ATTENDANCE %", { f: L("Attendance %"), v: att, numFmt: "0.0%" },
    { f: `"of "&${L("Working Days")}&" working days"`, v: `of ${wd} working days` });
  tile("D", "E", GREEN, "DAYS PRESENT", { f: L("Present"), v: s.present },
    { f: `"+ "&${L("Half Days")}&" half days"`, v: `+ ${s.halfDay} half days` });
  tile("F", "G", BLUE, "WORK FROM HOME", { f: L("WFH"), v: s.wfh },
    { f: `TEXT(${L("WFH %")},"0.0%")&" of working days"`, v: `${fmtPct1(wfhPct)} of working days` });
  tile("H", "I", AMBER, "LEAVE TAKEN", { f: L("Total Leaves"), v: s.leaves.total },
    { f: `"approved leave days"`, v: "approved leave days" });
  tile("J", "K", RED, "ABSENT", { f: L("Absent"), v: s.absent },
    { f: `TEXT(IF(${L("Working Days")}=0,0,${L("Absent")}/${L("Working Days")}),"0.0%")&" of working days"`, v: `${fmtPct1(absentPct)} of working days` });
  tile("L", "M", NAVY, "PUNCTUALITY %", { f: L("Punctuality %"), v: punct, numFmt: "0.0%" },
    { f: `${L("Late Arrivals")}&" late of "&Data!$E$2&" clocked days"`, v: `${late} late of ${clocked} clocked days` });

  // Key observations
  section(9, "KEY OBSERVATIONS");
  const obsStyle: StyleDef = { font: { sz: 10 }, fill: OBS, h: "left", wrap: true, indent: 1 };
  rep.put("B10:M10", {
    f: `"•  Attendance was "&TEXT(${L("Attendance %")},"0.0%")&" across "&${L("Working Days")}&" working days: "&${L("Present")}&" present, "&${L("WFH")}&" WFH, "&${L("Half Days")}&" half day(s), "&${L("Total Leaves")}&" on leave and "&${L("Absent")}&" absent."`,
    v: `•  Attendance was ${fmtPct1(att)} across ${wd} working days: ${s.present} present, ${s.wfh} WFH, ${s.halfDay} half day(s), ${s.leaves.total} on leave and ${s.absent} absent.`,
    style: obsStyle,
  });
  rep.put("B11:M11", {
    f: `IF(Data!$E$2=0,"•  No clock-in data was recorded in this period, so punctuality can't be measured.","•  Arrived late on "&${L("Late Arrivals")}&" of "&Data!$E$2&" clocked days (average clock-in "&TEXT(${L("Avg Clock-In")},"hh:mm")&"), giving punctuality of "&TEXT(${L("Punctuality %")},"0.0%")&".")`,
    v: clocked === 0
      ? "•  No clock-in data was recorded in this period, so punctuality can't be measured."
      : `•  Arrived late on ${late} of ${clocked} clocked days (average clock-in ${inMin === null ? "—" : fmtHHMM(inMin)}), giving punctuality of ${fmtPct1(punct)}.`,
    style: obsStyle,
  });
  rep.put("B12:M12", {
    f: `IF(Data!$E$2=0,"•  No working hours were recorded in this period.","•  Average day was "&TEXT(${L("Avg Hours / Day")},"[h]""h ""mm""m""")&" ("&TEXT(${L("Avg Clock-In")},"hh:mm")&" to "&TEXT(${L("Avg Clock-Out")},"hh:mm")&"), with "&TEXT(${L("Overtime")},"[h]""h ""mm""m""")&" overtime and "&${L("Early Departures")}&" early departure(s) in the period.")`,
    v: clocked === 0
      ? "•  No working hours were recorded in this period."
      : `•  Average day was ${fmtDur(avgMin)} (${inMin === null ? "—" : fmtHHMM(inMin)} to ${outMin === null ? "—" : fmtHHMM(outMin)}), with ${fmtDur(otMin)} overtime and ${early} early departure(s) in the period.`,
    style: obsStyle,
  });

  // Where the working days went
  section(14, "WHERE THE WORKING DAYS WENT");
  const thin: Edge = { style: "thin", color: LINE };
  const allThin: BorderDef = { left: thin, right: thin, top: thin, bottom: thin };
  const tblHdr: StyleDef = { font: { sz: 10, b: true, color: WHITE }, fill: NAVY, h: "center", border: allThin };
  rep.put("H15:J15", { v: "Category", style: tblHdr });
  rep.put("K15", { v: "Days", style: tblHdr });
  rep.put("L15:M15", { v: "% of working days", style: tblHdr });

  const cats: { label: string; key: string; v: number; color: string; chart: string }[] = [
    { label: "Present",        key: "Present",      v: s.present,      color: GREEN, chart: GREEN },
    { label: "Work from home", key: "WFH",          v: s.wfh,          color: BLUE,  chart: BLUE },
    { label: "Half days",      key: "Half Days",    v: s.halfDay,      color: TEAL,  chart: TEAL },
    { label: "Leave",          key: "Total Leaves", v: s.leaves.total, color: AMBER, chart: AMBER_CHART },
    { label: "Absent",         key: "Absent",       v: s.absent,       color: RED,   chart: RED },
  ];
  cats.forEach((c, i) => {
    const r = 16 + i;
    rep.box(`H${r}:J${r}`, { font: { sz: 10 }, h: "left", indent: 1, border: { top: thin, bottom: thin, right: thin } }, { left: { style: "thick", color: c.color } });
    rep.set(`H${r}`, { v: c.label }); rep.merges.push(`H${r}:J${r}`);
    rep.put(`K${r}`, { f: L(c.key), v: c.v, style: { font: { sz: 10 }, h: "center", border: allThin } });
    rep.put(`L${r}:M${r}`, { f: `IF(${L("Working Days")}=0,0,K${r}/${L("Working Days")})`, v: wd > 0 ? c.v / wd : 0, style: { font: { sz: 10 }, h: "center", border: allThin, numFmt: "0.0%" } });
  });
  const catSum = cats.reduce((a, c) => a + c.v, 0);
  rep.put("H21:J21", { v: "Total", style: { font: { sz: 10, b: true }, fill: TOTAL, h: "left", indent: 1, border: allThin } });
  rep.put("K21", { f: "SUM(K16:K20)", v: catSum, style: { font: { sz: 10, b: true }, fill: TOTAL, h: "center", border: allThin } });
  rep.put("L21:M21", {
    f: `IF(K21=${L("Working Days")},"matches working days","CHECK")`,
    v: catSum === wd ? "matches working days" : "CHECK",
    style: { font: { sz: 9, i: true, color: GREY }, fill: TOTAL, h: "center", border: allThin },
  });
  // CHECK in red
  const dxRed = st.dxf({ b: true, color: RED });
  rep.cond.push(`<conditionalFormatting sqref="L21:M21"><cfRule type="cellIs" dxfId="${dxRed}" priority="1" operator="equal"><formula>"CHECK"</formula></cfRule></conditionalFormatting>`);

  // Calendar block
  rep.put("H23:M23", {
    v: isGroup ? `Calendar for the period (${calendarDays} days × ${headcount} employees)` : "Calendar for the period",
    f: isGroup ? `"Calendar for the period ("&(${L("To")}-${L("From")}+1)&" days × "&${L("Employees")}&" employees)"` : undefined, style: { font: { sz: 10, b: true, color: NAVY }, h: "left", border: { bottom: { style: "medium", color: NAVY } } } });
  const otherDays = calendarTotal - wd - s.weekOff - s.holiday;
  const calRows: [string, string, number][] = [
    ["Working days", L("Working Days"), wd],
    ["+ Week offs", L("Week Offs"), s.weekOff],
    ["+ Holidays", L("Holidays"), s.holiday],
    ["+ Not counted (blank / inactive)", "K28-SUM(K24:K26)", otherDays],
  ];
  calRows.forEach(([label, f, v], i) => {
    const r = 24 + i;
    rep.put(`H${r}:J${r}`, { v: label, style: { font: { sz: 10 }, h: "left", indent: 1, border: allThin } });
    rep.put(`K${r}`, { f, v, style: { font: { sz: 10 }, h: "center", border: allThin } });
  });
  rep.put("H28:J28", {
    v: isGroup ? `= Calendar days × employees` : "= Calendar days",
    style: { font: { sz: 10, b: true }, fill: TOTAL, h: "left", indent: 1, border: allThin },
  });
  rep.put("K28", {
    f: isGroup ? `(${L("To")}-${L("From")}+1)*${L("Employees")}` : `${L("To")}-${L("From")}+1`,
    v: calendarTotal,
    style: { font: { sz: 10, b: true }, fill: TOTAL, h: "center", border: allThin },
  });
  rep.put("L28:M28", {
    f: `IF(K27=0,"all days accounted for",K27&" day(s) with no data")`,
    v: otherDays === 0 ? "all days accounted for" : `${otherDays} day(s) with no data`,
    style: { font: { sz: 9, i: true, color: GREY }, fill: TOTAL, h: "center", border: allThin },
  });

  // Time & punctuality
  section(30, `TIME & PUNCTUALITY   (based on ${clocked} days with clock data)`, `"TIME & PUNCTUALITY   (based on "&Data!$E$2&" days with clock data)"`);
  const tile3 = (
    row: number, c1: string, c3: string, color: string, label: string,
    value: { f: string; v: Val; numFmt?: string }, caption: { f?: string; v: Val },
  ) => {
    const edges = { left: white, right: white };
    rep.box(`${c1}${row}:${c3}${row}`, { font: { sz: 8, b: true, color: GREY }, fill: TILE, h: "center" }, { ...edges, top: { style: "thick", color } });
    rep.box(`${c1}${row + 1}:${c3}${row + 1}`, { font: { sz: 18, b: true, color }, fill: TILE, h: "center", numFmt: value.numFmt }, edges);
    rep.box(`${c1}${row + 2}:${c3}${row + 2}`, { font: { sz: 8, color: GREY }, fill: TILE, h: "center" }, edges);
    rep.set(`${c1}${row}`, { v: label }); rep.merges.push(`${c1}${row}:${c3}${row}`);
    rep.set(`${c1}${row + 1}`, { f: value.f, v: value.v }); rep.merges.push(`${c1}${row + 1}:${c3}${row + 1}`);
    rep.set(`${c1}${row + 2}`, { f: caption.f, v: caption.v }); rep.merges.push(`${c1}${row + 2}:${c3}${row + 2}`);
  };
  // Durations are shown as text ("7h 56m") so every viewer renders them the same.
  const durText = (label: string) => `TEXT(${L(label)},"[h]""h ""mm""m""")`;
  tile3(31, "B", "D", NAVY, "AVG CLOCK-IN",  { f: L("Avg Clock-In"),  v: inMin === null ? "—" : inMin / 1440, numFmt: "hh:mm" }, { v: "average first punch" });
  tile3(31, "E", "G", NAVY, "AVG CLOCK-OUT", { f: L("Avg Clock-Out"), v: outMin === null ? "—" : outMin / 1440, numFmt: "hh:mm" }, { v: "average last punch" });
  tile3(31, "H", "J", NAVY, "AVG HOURS / DAY", { f: durText("Avg Hours / Day"), v: fmtDur(avgMin) }, { v: "per clocked day" });
  tile3(31, "K", "M", NAVY, "TOTAL HOURS", { f: durText("Total Hours"), v: fmtDur(totalMin) }, { v: "for the period" });
  tile3(35, "B", "D", RED, "LATE ARRIVALS", { f: L("Late Arrivals"), v: late },
    { f: `"of "&Data!$E$2&" clocked days"`, v: `of ${clocked} clocked days` });
  tile3(35, "E", "G", AMBER, "EARLY DEPARTURES", { f: L("Early Departures"), v: early },
    { f: `"of "&Data!$E$2&" clocked days"`, v: `of ${clocked} clocked days` });
  tile3(35, "H", "J", NAVY, "PUNCTUALITY %", { f: L("Punctuality %"), v: punct, numFmt: "0.0%" }, { v: "on-time arrivals (by 10:00)" });
  tile3(35, "K", "M", GREEN, "OVERTIME", { f: durText("Overtime"), v: fmtDur(otMin) }, { v: "beyond 9h per day" });

  // Punctuality colour by value: green ≥ 80%, amber 60–80%, red < 60%
  const dxGood = st.dxf({ b: true, color: GREEN });
  const dxMid  = st.dxf({ b: true, color: AMBER });
  const dxBad  = st.dxf({ b: true, color: RED });
  rep.cond.push(
    `<conditionalFormatting sqref="L6 H36">` +
    `<cfRule type="cellIs" dxfId="${dxGood}" priority="4" operator="greaterThanOrEqual"><formula>0.8</formula></cfRule>` +
    `<cfRule type="cellIs" dxfId="${dxMid}" priority="5" operator="greaterThanOrEqual"><formula>0.6</formula></cfRule>` +
    `<cfRule type="cellIs" dxfId="${dxBad}" priority="6" operator="lessThan"><formula>0.6</formula></cfRule>` +
    `</conditionalFormatting>`,
  );

  // Leave types
  section(50, "LEAVE TYPES (highlighted when used)");
  const leaveHalf = Math.ceil(LEAVE_CODES.length / 2);
  const leaveCells: string[] = [];
  LEAVE_CODES.forEach((code, i) => {
    const left = i < leaveHalf;
    const r = 51 + (left ? i : i - leaveHalf);
    const [lc1, lc2, vc] = left ? ["B", "F", "G"] : ["H", "L", "M"];
    const n = s.leaves[code] ?? 0;
    rep.put(`${lc1}${r}:${lc2}${r}`, { v: leaveLabel(code), style: { font: { sz: 10 }, h: "left", indent: 1, border: allThin } });
    rep.put(`${vc}${r}`, { f: `IF(${L(leaveLabel(code))}=0,"–",${L(leaveLabel(code))})`, v: n === 0 ? "–" : n, style: { font: { sz: 10 }, h: "center", border: allThin } });
    leaveCells.push(`${vc}${r}`);
  });
  // Non-zero leave counts in bold amber (each column gets its own relative rule)
  const dxAmber = st.dxf({ b: true, color: AMBER }, "FFF4D6");
  const rightCells = leaveCells.filter(c => c.startsWith("M"));
  const leftCells  = leaveCells.filter(c => c.startsWith("G"));
  rep.cond.push(`<conditionalFormatting sqref="${leftCells.join(" ")}"><cfRule type="expression" dxfId="${dxAmber}" priority="2"><formula>ISNUMBER(G51)</formula></cfRule></conditionalFormatting>`);
  rep.cond.push(`<conditionalFormatting sqref="${rightCells.join(" ")}"><cfRule type="expression" dxfId="${dxAmber}" priority="3"><formula>ISNUMBER(M51)</formula></cfRule></conditionalFormatting>`);
  const totalLeaveRow = 51 + leaveHalf;
  rep.height(totalLeaveRow, 18);
  rep.put(`B${totalLeaveRow}:F${totalLeaveRow}`, { v: "Total leaves", style: { font: { sz: 10, b: true }, fill: TOTAL, h: "left", indent: 1, border: allThin } });
  rep.put(`G${totalLeaveRow}`, { f: L("Total Leaves"), v: s.leaves.total, style: { font: { sz: 10, b: true }, fill: TOTAL, h: "center", border: allThin } });
  rep.put(`H${totalLeaveRow}:M${totalLeaveRow}`, { v: "Late / early cut-offs: in after 10:00, out before 19:00", style: { font: { sz: 8, i: true, color: GREY }, h: "right" } });

  const lastRow = totalLeaveRow;
  rep.extra.printArea = `Report!$A$1:$N$${lastRow}`;
  rep.extra.drawingRid = "rId1";

  // ── Extra tabs for Team / Master ──────────────────────────────────────────
  const extraSheets: Sheet[] = [];
  if (isGroup && input.employees?.length) extraSheets.push(employeesSheet(st, input.employees, input.kind === "master"));
  if (input.kind === "master" && input.teams?.length) extraSheets.push(teamsSheet(st, input.teams));

  // ── Charts ────────────────────────────────────────────────────────────────
  const chart1 = doughnutXml(cats.map(c => c.label), cats.map(c => c.v), cats.map(c => c.chart), "Report!$H$16:$H$20", "Report!$K$16:$K$20");
  const chart2 = stackedBarXml(["Arrivals", "Departures"], "Data!$D$5:$D$6", [
    { name: "On time / Normal", nameRef: "Data!$E$4", color: GREEN, ref: "Data!$E$5:$E$6", vals: [clocked - late, clocked - early], labelColor: WHITE },
    { name: "Late / Early",     nameRef: "Data!$F$4", color: RED,   ref: "Data!$F$5:$F$6", vals: [late, early], labelColor: WHITE },
  ]);
  const drawing = drawingXml([
    { from: [1, 14], to: [7, 28], rid: "rId1", id: 2, name: "Working days chart" },
    { from: [1, 38], to: [13, 48], rid: "rId2", id: 3, name: "Arrivals chart" },
  ]);

  // ── Package ───────────────────────────────────────────────────────────────
  const sheets = [rep, data, ...extraSheets];
  const files: [string, string][] = [];
  files.push(["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` +
    `<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` +
    `<Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`]);
  files.push(["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
    `</Relationships>`]);
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  files.push(["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(`${title1} — ${identity.name}`)}</dc:title><dc:creator>POP Attendance</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`]);
  files.push(["docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>POP Attendance</Application></Properties>`]);
  files.push(["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<bookViews><workbookView activeTab="0"/></bookViews><sheets>` +
    sheets.map((sh, i) => `<sheet name="${esc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">${rep.extra.printArea}</definedName></definedNames>` +
    `<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`]);
  files.push(["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`]);
  sheets.forEach((sh, i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, sh.xml()]));
  files.push(["xl/worksheets/_rels/sheet1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`]);
  files.push(["xl/drawings/drawing1.xml", drawing]);
  files.push(["xl/drawings/_rels/drawing1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/></Relationships>`]);
  files.push(["xl/charts/chart1.xml", chart1]);
  files.push(["xl/charts/chart2.xml", chart2]);
  files.push(["xl/styles.xml", st.xml()]); // last: every sheet has registered its styles

  const enc = new TextEncoder();
  const CFB = (XLSX as unknown as { CFB: CfbLib }).CFB;
  const cfb = CFB.utils.cfb_new();
  for (const [path, xml] of files) CFB.utils.cfb_add(cfb, `/${path}`, enc.encode(xml));
  // Browsers may return a plain number[] — normalise to bytes.
  return Uint8Array.from(CFB.write(cfb, { type: "array", fileType: "zip", compression: true }));
}

interface CfbLib {
  utils: { cfb_new(): unknown; cfb_add(cfb: unknown, path: string, content: Uint8Array): void };
  write(cfb: unknown, opts: { type: "array"; fileType: "zip"; compression: boolean }): Uint8Array | number[];
}

// ── Employees / Teams tabs ───────────────────────────────────────────────────
function tableSheet(
  st: Styles, name: string, headers: { label: string; width: number; fmt?: string; align?: "left" | "center" | "right" }[],
  rows: Val[][],
): Sheet {
  const sh = new Sheet(name, st);
  sh.extra.gridlines = false;
  sh.extra.freezeRow = 1;
  const thin: Edge = { style: "thin", color: LINE };
  const b: BorderDef = { left: thin, right: thin, top: thin, bottom: thin };
  headers.forEach((h, i) => {
    sh.width(i + 1, h.width);
    sh.set(`${colLetter(i + 1)}1`, { v: h.label, s: st.get({ font: { sz: 10, b: true, color: WHITE }, fill: NAVY, h: "center", wrap: true, border: b }) });
  });
  sh.height(1, 30);
  rows.forEach((row, ri) => {
    const fill = ri % 2 ? TILE : undefined;
    row.forEach((v, ci) => {
      const h = headers[ci];
      sh.set(`${colLetter(ci + 1)}${ri + 2}`, {
        v, s: st.get({ font: { sz: 10 }, fill, border: b, h: h.align ?? (typeof v === "number" ? "center" : "left"), numFmt: h.fmt }),
      });
    });
  });
  return sh;
}

function employeesSheet(st: Styles, employees: ReportEmployeeRow[], showTeam: boolean): Sheet {
  const headers = [
    { label: "Employee ID", width: 12 }, { label: "Name", width: 26 },
    ...(showTeam ? [{ label: "Team", width: 18 }] : []),
    { label: "BU Lead", width: 16 },
    { label: "Present", width: 9 }, { label: "WFH", width: 8 }, { label: "Half Days", width: 9 }, { label: "Absent", width: 8 },
    { label: "Leaves", width: 8 }, { label: "Working Days", width: 10 },
    { label: "Attendance %", width: 11, fmt: "0.0%" },
    { label: "Attendance % calculation", width: 30, align: "left" as const },
    { label: "WFH %", width: 9, fmt: "0.0%" },
    { label: "WFH % calculation", width: 20, align: "left" as const },
    { label: "Total Hours", width: 11, fmt: '[h]\\h\\ mm\\m' },
    { label: "Avg Hours / Day", width: 11, fmt: '[h]\\h\\ mm\\m' },
    { label: "Late Arrivals", width: 9 },
  ];
  const sorted = [...employees].sort((a, b) => a.employee.team.localeCompare(b.employee.team) || a.employee.name.localeCompare(b.employee.name));
  const rows = sorted.map(e => {
    const s = e.summary;
    return [
      e.employee.employeeId, e.employee.name,
      ...(showTeam ? [e.employee.team] : []),
      e.employee.buLead,
      s.present, s.wfh, s.halfDay, s.absent, s.leaves.total, s.workingDays,
      s.attendancePercent / 100,
      `(${s.present} + ${s.wfh} + 0.5 × ${s.halfDay}) ÷ ${s.workingDays}`,
      s.wfhPercent / 100,
      `${s.wfh} ÷ ${s.workingDays}`,
      e.totalMinutes / 1440,
      durToMin(e.avgHoursPerDay) / 1440,
      e.lateArrivals,
    ] as Val[];
  });
  return tableSheet(st, "Employees", headers, rows);
}

function teamsSheet(st: Styles, teams: ReportTeamRow[]): Sheet {
  const headers = [
    { label: "Team", width: 22 }, { label: "Employees", width: 10 },
    { label: "Present", width: 9 }, { label: "WFH", width: 8 }, { label: "Half Days", width: 9 }, { label: "Absent", width: 8 },
    { label: "Leaves", width: 8 }, { label: "Working Days", width: 10 },
    { label: "Attendance %", width: 11, fmt: "0.0%" },
    { label: "WFH %", width: 9, fmt: "0.0%" },
    { label: "Total Hours", width: 12, fmt: '[h]\\h\\ mm\\m' },
  ];
  const rows = teams.map(t => [
    t.team, t.employeeCount, t.summary.present, t.summary.wfh, t.summary.halfDay, t.summary.absent,
    t.summary.leaves.total, t.summary.workingDays, t.summary.attendancePercent / 100, t.summary.wfhPercent / 100,
    (t.timeMetrics?.totalMinutes ?? 0) / 1440,
  ] as Val[]);
  return tableSheet(st, "Teams", headers, rows);
}

/** Browser helper: build and download the report. */
export function downloadReport(input: ReportInput, filename: string) {
  const bytes = buildReportWorkbook(input);
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse CSV text into a 2-D array of strings.
 * Handles RFC 4180 quoted fields (commas inside quotes).
 * Strips UTF-8 BOM if present.
 */
export function parseCsvText(text: string): string[][] {
  // Strip BOM
  const clean = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  const lines = clean.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let i = 0;

    while (i < line.length) {
      if (line[i] === '"') {
        // Quoted field
        let field = "";
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"') {
            if (line[i + 1] === '"') { field += '"'; i += 2; }
            else { i++; break; } // closing quote
          } else {
            field += line[i++];
          }
        }
        if (i < line.length && line[i] === ",") i++;
        fields.push(field);
      } else {
        // Unquoted field
        const comma = line.indexOf(",", i);
        if (comma === -1) {
          fields.push(line.slice(i));
          i = line.length;
        } else {
          fields.push(line.slice(i, comma));
          i = comma + 1;
        }
      }
    }
    // Trailing comma → trailing empty field
    if (line.endsWith(",")) fields.push("");
    rows.push(fields);
  }

  return rows;
}

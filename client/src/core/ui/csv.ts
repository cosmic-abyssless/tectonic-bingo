// CSV for the "Copy as CSV" buttons (signup roster, audit logs, draft pool): a cell quoted when it has to be.
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** A header row and data rows as CSV text. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

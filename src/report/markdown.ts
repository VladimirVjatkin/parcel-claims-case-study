// Společný zápis Markdown tabulek: zalomení a svislé čáry v citacích nesmějí rozbít sloupce.
function escapeCell(value: string): string {
  return value.replace(/\r\n|\r|\n/g, " ").replace(/\|/g, "\\|");
}

function tableRow(cells: string[]): string {
  const escaped: string[] = [];
  for (const cell of cells) escaped.push(escapeCell(cell));
  return `| ${escaped.join(" | ")} |`;
}

// Skládá tabulku ze stejných pravidel pro hlavičku i data, aby reporty měly jednotný formát.
export function addTable(lines: string[], headers: string[], rows: string[][]): void {
  lines.push(tableRow(headers));
  lines.push(`|${headers.map(() => "---").join("|")}|`);
  for (const row of rows) lines.push(tableRow(row));
}

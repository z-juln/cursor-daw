function cellColumns(line: string): number[] {
  const firstBar = line.indexOf("|");
  const match = line.match(/^([A-Za-z][A-Za-z0-9_-]{0,15})\s+/);
  const start = firstBar >= 0 ? firstBar + 1 : (match?.[0].length ?? 0);
  const result: number[] = [];
  for (let column = start; column < line.length; column += 1) {
    if (line[column] !== "|") result.push(column);
  }
  return result;
}

export function columnToStep(line: string, column: number): number {
  const columns = cellColumns(line);
  if (columns.length === 0 || column <= columns[0]) return 0;
  const right = columns.findIndex((cellColumn) => cellColumn >= column);
  return right < 0 ? columns.length - 1 : right;
}

export function stepToColumn(line: string, step: number): number {
  return cellColumns(line)[Math.max(0, step)] ?? line.length;
}

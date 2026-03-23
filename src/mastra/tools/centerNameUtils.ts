export function normalizeCenterName(name: string): string {
  let s = name.trim();
  const m = s.match(/^\(([^)]+)\)\s*(.*)/);
  if (m) {
    s = m[1].trim() + " - " + m[2].trim();
  }
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\u2013|\u2014/g, "-");
  return s.toUpperCase();
}

/** OnlineTest Direction.name (DI, TPI, PI, …) — fayl/fan nomidan. */

export function matchDirectionCode(value: string | null | undefined, allowed: string[]): string {
  const key = (value || '').trim().toLowerCase();
  if (!key) return '';
  return allowed.find((code) => code.trim().toLowerCase() === key)?.trim() || '';
}

export function inferDirectionCode(text: string, allowed: string[]): string {
  const pool = allowed.map((c) => c.trim()).filter(Boolean);
  if (!text || !pool.length) return '';
  const base = text.replace(/\.(pdf|docx?|xlsx?)$/i, '').trim();
  const paren = base.match(/\(([^)]+)\)\s*$/);
  if (paren?.[1]) {
    const hit = matchDirectionCode(paren[1], pool);
    if (hit) return hit;
  }
  const sorted = [...pool].sort((a, b) => b.length - a.length);
  for (const code of sorted) {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, 'iu');
    if (re.test(base)) return code;
  }
  return '';
}

export function resolveSyllabusDirection(
  row: { direction_code?: string | null; subject_name?: string; file_name?: string },
  allowed: string[],
): string {
  return (
    matchDirectionCode(row.direction_code, allowed) ||
    inferDirectionCode(row.subject_name || '', allowed) ||
    inferDirectionCode(row.file_name || '', allowed)
  );
}

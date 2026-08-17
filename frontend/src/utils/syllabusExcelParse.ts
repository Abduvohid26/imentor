import type { SyllabusTopic } from '../services/aiService';

export type ParsedSyllabusExcel = {
  topics: SyllabusTopic[];
  skippedLabCount: number;
  asText: string;
};

function norm(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyActivity(value: string): 'lecture' | 'practical' | 'lab' | 'unknown' {
  const s = norm(value);
  if (!s) return 'unknown';
  if (/laborator|лаборатор|\blab\b/.test(s)) return 'lab';
  if (/ma'?ruza|maruza|lecture|лекци|теорет/.test(s)) return 'lecture';
  if (/amaliy|practical|практик|seminar|семинар/.test(s)) return 'practical';
  return 'unknown';
}

function isTitleHeader(cell: string): boolean {
  const s = norm(cell);
  if (!s) return false;
  if (/^(nomi|mavzu|title|topic|тема|название)$/.test(s)) return true;
  if (/mavzu\s*nomi|topic\s*name|название\s*тем/.test(s)) return true;
  return s === "fan nomi" || s === 'subject';
}

function isTypeHeader(cell: string): boolean {
  const s = norm(cell);
  if (!s) return false;
  if (/mashg'?ul/.test(s)) return true;
  if (/^(turi|type|вид)$/.test(s)) return true;
  return /mashg'?ulot|заняти/.test(s);
}

function looksLikeHeaderRow(row: string[]): boolean {
  return row.some(isTitleHeader) || row.some(isTypeHeader);
}

function detectTypeColumn(rows: string[][], titleCol: number): number {
  const sample = rows.slice(0, 12);
  let best = -1;
  let bestHits = 0;
  const width = Math.max(0, ...sample.map((r) => r.length));
  for (let col = 0; col < width; col++) {
    if (col === titleCol) continue;
    const hits = sample.reduce((n, row) => (classifyActivity(row[col] || '') === 'unknown' ? n : n + 1), 0);
    if (hits > bestHits) {
      bestHits = hits;
      best = col;
    }
  }
  return bestHits >= 2 ? best : -1;
}

function titleLooksLikeLab(title: string): boolean {
  return classifyActivity(title) === 'lab' || /^laboratoriya\b/i.test(title.trim());
}

/**
 * Excel (Nomi + Mashg'ul) qatorlaridan ma'ruza/amaliy mavzular.
 * Laboratoriya qatorlari ataylab tashlanadi.
 */
export function parseSyllabusExcel(rows: string[][]): ParsedSyllabusExcel {
  let headerIdx = rows.findIndex(looksLikeHeaderRow);
  if (headerIdx < 0) headerIdx = -1;

  const header = headerIdx >= 0 ? rows[headerIdx] : [];
  let titleCol = header.findIndex(isTitleHeader);
  let typeCol = header.findIndex(isTypeHeader);
  const dataRows = rows.slice(headerIdx + 1);

  if (titleCol < 0) {
    // Sarlavha yo'q — 2-ustun (B) yoki eng uzun matnli ustun.
    titleCol = 1;
    const width = Math.max(0, ...dataRows.map((r) => r.length));
    if (width > 0 && dataRows.every((r) => !(r[titleCol] || '').trim())) {
      titleCol = 0;
    }
  }
  if (typeCol < 0) typeCol = detectTypeColumn(dataRows, titleCol);

  const lectures: string[] = [];
  const practicals: string[] = [];
  let skippedLabCount = 0;
  const seen = new Set<string>();

  for (const row of dataRows) {
    const title = (row[titleCol] || '').replace(/\s+/g, ' ').trim();
    if (title.length < 4) continue;
    if (looksLikeHeaderRow(row)) continue;
    if (seen.has(title.toLowerCase())) continue;

    const typeRaw = typeCol >= 0 ? row[typeCol] || '' : '';
    let kind = classifyActivity(typeRaw);
    if (kind === 'unknown' && titleLooksLikeLab(title)) kind = 'lab';
    if (kind === 'lab') {
      skippedLabCount += 1;
      seen.add(title.toLowerCase());
      continue;
    }
    if (kind === 'unknown') {
      // Turi bo'sh bo'lsa ham mavzu saqlanadi — default ma'ruza.
      kind = 'lecture';
    }
    seen.add(title.toLowerCase());
    if (kind === 'practical') practicals.push(title);
    else lectures.push(title);
  }

  const topics: SyllabusTopic[] = [
    ...lectures.map((title, i) => ({ id: `L${i + 1}`, title, type: 'lecture' as const })),
    ...practicals.map((title, i) => ({ id: `A${i + 1}`, title, type: 'practical' as const })),
  ];

  const asText = [
    ...lectures.map((t, i) => `L${i + 1}\tMa'ruza\t${t}`),
    ...practicals.map((t, i) => `A${i + 1}\tAmaliy\t${t}`),
  ].join('\n');

  return { topics, skippedLabCount, asText };
}

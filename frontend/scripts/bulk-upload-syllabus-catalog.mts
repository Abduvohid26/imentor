/**
 * Fan katalogiga papka (fan nomi) + ichidagi PDF (yo'nalish) yuklash.
 *
 *   npx tsx scripts/bulk-upload-syllabus-catalog.mts \
 *     --api https://imentor.devflix.uz/api \
 *     --phone 998901110001 --password 'AdminDemo123' \
 *     --root "/path/Fan sillabuslari" \
 *     --only "Urologiya va onkologiya"
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  extractTopicsByRegex,
  guessSubjectFromDocumentText,
  normalizeSyllabusDocumentText,
} from '../src/utils/syllabusTopicParse.ts';
import { parseVariantLabel } from '../src/utils/syllabusVariant.ts';
import type { SyllabusTopic } from '../src/services/aiService.ts';

type SyllabusVariant = {
  label: string;
  file_name: string;
  topics: SyllabusTopic[];
};

type CourseSyllabusRow = {
  id: number;
  subject_name: string;
  variants: SyllabusVariant[];
};

function parseArgs(argv: string[]) {
  const get = (flag: string, fallback = '') => {
    const i = argv.indexOf(flag);
    return i >= 0 ? (argv[i + 1] || fallback) : fallback;
  };
  const has = (flag: string) => argv.includes(flag);
  return {
    api: get('--api', 'https://imentor.devflix.uz/api').replace(/\/$/, ''),
    phone: get('--phone', process.env.ADMIN_PHONE || '998901110001'),
    password: get('--password', process.env.ADMIN_PASSWORD || ''),
    root: get('--root', ''),
    only: get('--only', ''),
    dryRun: has('--dry-run'),
    skipExisting: !has('--force'),
  };
}

function dedupeVariantLabels(variants: SyllabusVariant[]): SyllabusVariant[] {
  const used = new Set<string>();
  return variants.map((v) => {
    const base = (v.label || '').trim() || 'Asosiy';
    let label = base;
    let n = 2;
    while (used.has(label.toLowerCase())) {
      label = `${base} ${n}`;
      n += 1;
    }
    used.add(label.toLowerCase());
    return { ...v, label };
  });
}

function extractPdfText(filePath: string): string {
  return execSync(`pdftotext -layout "${filePath}" -`, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function extractTopicsFromPdf(filePath: string, fileName: string): SyllabusTopic[] {
  const text = normalizeSyllabusDocumentText(extractPdfText(filePath));
  if (!text.trim()) return [];
  const topics = extractTopicsByRegex(text);
  if (topics.length) return topics;
  void guessSubjectFromDocumentText(text);
  void fileName;
  return [];
}

async function apiJson<T>(
  base: string,
  token: string,
  route: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${base}${route}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${route}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body as T;
}

async function login(api: string, phone: string, password: string): Promise<string> {
  const data = await apiJson<{ access: string }>(api, '', '/v1/auth/local-login/', {
    method: 'POST',
    body: JSON.stringify({ phone_digits: phone, password }),
  });
  if (!data.access) throw new Error('Login failed: no access token');
  return data.access;
}

async function fetchCatalog(api: string, token: string): Promise<CourseSyllabusRow[]> {
  const data = await apiJson<CourseSyllabusRow[] | { results: CourseSyllabusRow[] }>(
    api,
    token,
    '/v1/admin/course-syllabuses/?page_size=500',
  );
  return Array.isArray(data) ? data : data.results || [];
}

function listSubjectDirs(root: string, only: string): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => !only || name === only)
    .sort((a, b) => a.localeCompare(b, 'uz'));
}

function listPdfFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /\.pdf$/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'uz'));
}

async function createSubject(
  api: string,
  token: string,
  subjectName: string,
  variants: SyllabusVariant[],
  sortOrder: number,
): Promise<CourseSyllabusRow> {
  return apiJson<CourseSyllabusRow>(api, token, '/v1/admin/course-syllabuses/', {
    method: 'POST',
    body: JSON.stringify({
      subject_name: subjectName,
      instruction_language: 'uz',
      variants,
      sort_order: sortOrder,
    }),
  });
}

async function appendVariants(
  api: string,
  token: string,
  id: number,
  variants: SyllabusVariant[],
): Promise<CourseSyllabusRow> {
  return apiJson<CourseSyllabusRow>(api, token, `/v1/admin/course-syllabuses/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ variants, append_variants: true }),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.root || !fs.existsSync(args.root)) {
    console.error('Kerak: --root "/path/Fan sillabuslari"');
    process.exit(1);
  }
  if (!args.password) {
    console.error('Kerak: --password yoki ADMIN_PASSWORD env');
    process.exit(1);
  }

  console.log('API:', args.api);
  console.log('Root:', args.root);
  if (args.only) console.log('Only:', args.only);
  if (args.dryRun) console.log('DRY RUN');

  const token = await login(args.api, args.phone, args.password);
  const existing = await fetchCatalog(args.api, token);
  const byName = new Map(existing.map((r) => [r.subject_name.trim().toLowerCase(), r]));
  console.log('Existing subjects:', existing.length);

  const dirs = listSubjectDirs(args.root, args.only);
  let created = 0;
  let updated = 0;
  let skippedSubjects = 0;
  let skippedFiles = 0;
  let sortOrder = existing.length;

  for (const subjectName of dirs) {
    const dir = path.join(args.root, subjectName);
    const pdfs = listPdfFiles(dir);
    if (!pdfs.length) {
      console.log(`[skip] ${subjectName}: PDF yo'q`);
      skippedSubjects += 1;
      continue;
    }

    const variants: SyllabusVariant[] = [];
    for (const fileName of pdfs) {
      const filePath = path.join(dir, fileName);
      try {
        const topics = extractTopicsFromPdf(filePath, fileName);
        if (!topics.length) {
          console.log(`  [file-skip] ${fileName}: 0 mavzu`);
          skippedFiles += 1;
          continue;
        }
        variants.push({
          label: parseVariantLabel(fileName),
          file_name: fileName,
          topics,
        });
        console.log(`  [ok] ${fileName}: ${topics.length} mavzu`);
      } catch (err) {
        console.log(`  [file-error] ${fileName}:`, err instanceof Error ? err.message : err);
        skippedFiles += 1;
      }
    }

    if (!variants.length) {
      console.log(`[skip] ${subjectName}: hech qanday fayl tahlil qilinmadi`);
      skippedSubjects += 1;
      continue;
    }

    const cleaned = dedupeVariantLabels(variants);
    const key = subjectName.trim().toLowerCase();
    const prev = byName.get(key);

    if (prev && args.skipExisting) {
      console.log(`[exists] ${subjectName} (id=${prev.id}) — o'tkazildi`);
      skippedSubjects += 1;
      continue;
    }

    if (args.dryRun) {
      console.log(`[dry] ${subjectName}: ${cleaned.length} yo'nalish, ${cleaned.reduce((n, v) => n + v.topics.length, 0)} mavzu`);
      continue;
    }

    if (prev) {
      const row = await appendVariants(args.api, token, prev.id, cleaned);
      byName.set(key, row);
      updated += 1;
      console.log(`[updated] ${subjectName} (+${cleaned.length} yo'nalish)`);
    } else {
      const row = await createSubject(args.api, token, subjectName, cleaned, sortOrder);
      byName.set(key, row);
      sortOrder += 1;
      created += 1;
      console.log(`[created] ${subjectName} (${cleaned.length} yo'nalish)`);
    }
  }

  console.log('---');
  console.log({ created, updated, skippedSubjects, skippedFiles, totalDirs: dirs.length });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

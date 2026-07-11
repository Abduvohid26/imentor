/**
 * AI javoblaridagi noto‘g‘ri / qisman JSON ni parse qilish (taqdimot, test, keys).
 */

function extractJsonSubstring(text: string): string {
  let jsonString = text.trim();
  const fenced = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) jsonString = fenced[1].trim();

  const arrStart = jsonString.indexOf('[');
  const objStart = jsonString.indexOf('{');
  const start =
    arrStart === -1 ? objStart : objStart === -1 ? arrStart : Math.min(arrStart, objStart);
  if (start < 0) return jsonString;

  const preferArray = start === arrStart;
  const end = preferArray ? jsonString.lastIndexOf(']') : jsonString.lastIndexOf('}');
  if (end > start) return jsonString.slice(start, end + 1);
  return jsonString.slice(start);
}

function normalizeSmartQuotes(input: string): string {
  return input
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2018\u2019\u2032]/g, "'");
}

function removeTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, '$1');
}

function stripJsonComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Satr ichidagi xom yangi qator / tab belgilarini JSON-safe qilish */
function escapeControlCharsInJsonStrings(input: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inString = false;
      continue;
    }
    if (ch === '\n') {
      out += '\\n';
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\t') {
      out += '\\t';
      continue;
    }
    out += ch;
  }
  return out;
}

function closeTruncatedJson(input: string): string {
  let s = input.trimEnd();
  if (!s) return s;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}') {
      if (stack[stack.length - 1] === '{') stack.pop();
    } else if (ch === ']') {
      if (stack[stack.length - 1] === '[') stack.pop();
    }
  }

  if (inString) s += '"';
  while (stack.length > 0) {
    const open = stack.pop();
    s += open === '[' ? ']' : '}';
  }
  return s;
}

function repairJsonString(input: string): string {
  let s = normalizeSmartQuotes(input);
  s = stripJsonComments(s);
  s = removeTrailingCommas(s);
  s = escapeControlCharsInJsonStrings(s);
  s = removeTrailingCommas(s);
  return s;
}

function tryParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

/** Massiv ichidagi to‘liq obyektlarni alohida parse qilish (qisman buzilgan javoblar uchun) */
function salvageJsonArray<T>(text: string): T[] | null {
  const start = text.indexOf('[');
  if (start < 0) return null;

  const items: T[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        const chunk = text.slice(objStart, i + 1);
        const repaired = repairJsonString(chunk);
        const parsed = tryParse<T>(repaired) ?? tryParse<T>(closeTruncatedJson(repaired));
        if (parsed != null) items.push(parsed);
        objStart = -1;
      }
    }
  }

  return items.length > 0 ? items : null;
}

export function parseAiJson<T>(text: string | undefined): T {
  if (!text?.trim()) throw new Error('Empty response from AI');

  const extracted = extractJsonSubstring(text);
  const attempts = [
    extracted,
    repairJsonString(extracted),
    closeTruncatedJson(repairJsonString(extracted)),
    repairJsonString(closeTruncatedJson(extracted)),
  ];

  for (const candidate of attempts) {
    const parsed = tryParse<T>(candidate);
    if (parsed != null) return parsed;
  }

  const salvaged = salvageJsonArray<T>(extracted);
  if (salvaged != null) return salvaged as T;

  console.error('JSON Parsing Error. Raw text (first 2000 chars):', text.slice(0, 2000));
  throw new Error('Failed to parse JSON response');
}

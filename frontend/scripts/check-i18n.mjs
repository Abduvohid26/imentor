import fs from 'fs';

const src = fs.readFileSync('src/i18n/translations.ts', 'utf8');

function parseLang(lang) {
  const marker = `\n  ${lang}: {`;
  const start = src.indexOf(marker);
  if (start < 0) return {};
  const nextMarkers = ['\n  ru: {', '\n  en: {', '\n} as const'];
  let end = src.length;
  for (const nm of nextMarkers) {
    const p = src.indexOf(nm, start + marker.length);
    if (p > start && p < end) end = p;
  }
  const block = src.slice(start, end);
  const out = {};
  const re = /'((?:\\'|[^'])*)':\s*'((?:\\'|[^'])*)'/g;
  let m;
  while ((m = re.exec(block))) {
    out[m[1].replace(/\\'/g, "'")] = m[2].replace(/\\'/g, "'");
  }
  return out;
}

const uz = parseLang('uz');
const en = parseLang('en');

// Heuristic: value looks mostly English (ASCII words common in UI)
const englishWords = /\b(the|and|for|with|your|please|click|select|upload|download|search|password|email|phone|session|inactive|student|employee|something|went|wrong|dashboard|assistant|professor|cancel|save|delete|welcome|error|loading|submit|create|edit|new|name|last|active|leave|blank|unchanged|required|cannot|remove|sole|admin|taken|code|short|sort|order|building|coords|course|description|hint|analyzing|progress|preview|will|open|no|topics|toggle|document|confirm|case|label|answer|complex|applications|owner|research|startup|dossier|notes|team|members|schedule|tab|live|map|pings|alerts|button|subtitle|current|week|alternating|every|upper|lower|day|slots|staff|legacy|radius|mode|single|add|interval|yet|lat|lng|data|time|auto|refresh|instructions|selected|list|old|ping|accuracy|alert|message|distance|notice|total|lectures|practicals|glossary|direction|more|scientific|project|type|note|projects|layer|about|character|count|summary|stage|hint|print|disclaimer|evaluation|word|criterion|comment|coach|chat|thinking|prompt|send|dialog|title|subtitle|name|placeholder|create|gate|can|cannot|recommendation|elevator|pitch|organization|contact|files|file|size|remove|save|submit|refresh)\b/i;

const suspicious = Object.entries(uz).filter(([k, v]) => {
  if (v === en[k]) return true;
  if (englishWords.test(v) && !/[а-яёА-ЯЁ]/.test(v) && !/[o'g'ʻ]/i.test(v)) {
    // has english words and no cyrillic/uz chars
    const uzChars = (v.match(/[ʻʼ'`]/g) || []).length;
    const latin = v.replace(/[^a-zA-Z]/g, '');
    if (latin.length > 8) return true;
  }
  return false;
});

console.log('suspicious uz entries:', suspicious.length);
suspicious.forEach(([k, v]) => console.log(k, '=>', v.slice(0, 80)));

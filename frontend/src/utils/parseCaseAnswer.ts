/** Keys yechimi matnini a–e bo'limlarga va adabiyotlar ro'yxatiga ajratadi. */

export type CaseAnswerSectionKey = 'a' | 'b' | 'c' | 'd' | 'e';

export type CaseAnswerSection = {
  key: CaseAnswerSectionKey;
  title: string;
  body: string;
};

export type ParsedCaseAnswer = {
  sections: CaseAnswerSection[];
  /** Bo'limlarga ajralmagan qoldiq (eski format). */
  leftover: string;
  bibliography: string;
};

const REFS_HEADING_RE =
  /(?:^|\n)\s*(?:FOYDALANILGAN\s+ADABIYOTLAR|ИСПОЛЬЗОВАННАЯ\s+ЛИТЕРАТУРА|REFERENCES\s+USED)\s*:?\s*(?:\n|$)/i;

const SECTION_RE = /^([a-e])\)\s*(.+)$/i;

export function parseCaseAnswer(raw: string): ParsedCaseAnswer {
  const text = (raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return { sections: [], leftover: '', bibliography: '' };

  let body = text;
  let bibliography = '';
  const refsSplit = text.split(REFS_HEADING_RE);
  if (refsSplit.length >= 2) {
    body = refsSplit[0].trim();
    bibliography = refsSplit.slice(1).join('\n').trim();
  }

  const lines = body.split('\n');
  const sections: CaseAnswerSection[] = [];
  let current: CaseAnswerSection | null = null;
  const preamble: string[] = [];

  for (const line of lines) {
    const m = line.trim().match(SECTION_RE);
    if (m) {
      if (current) sections.push(current);
      current = {
        key: m[1].toLowerCase() as CaseAnswerSectionKey,
        title: m[2].trim(),
        body: '',
      };
      continue;
    }
    if (current) {
      current.body = current.body ? `${current.body}\n${line}` : line;
    } else if (line.trim()) {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);

  return {
    sections: sections.map((s) => ({ ...s, body: s.body.trim() })),
    leftover: preamble.join('\n').trim(),
    bibliography,
  };
}

import { execSync } from 'child_process';
import path from 'path';
import { extractTopicsByRegex, guessSubjectFromDocumentText } from '../src/utils/syllabusTopicParse.ts';

const dir =
  process.argv[2] ||
  '/home/abduvohid/Downloads/Telegram Desktop/Fan sillabuslari/Urologiya va onkologiya';

for (const name of process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['Onkologiya(TBI).pdf', 'Onkologiya(XT).pdf', 'Xirurgik kasaliklar.Urologiya(XT).pdf']) {
  const file = path.join(dir, name);
  const text = execSync(`pdftotext -layout "${file}" -`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const topics = extractTopicsByRegex(text);
  const subject = guessSubjectFromDocumentText(text);
  console.log('---', name);
  console.log('chars:', text.length, 'topics:', topics.length, 'subject:', subject || '(none)');
  topics.forEach((t) => console.log(' ', t.id, t.type, t.title.slice(0, 80)));
}

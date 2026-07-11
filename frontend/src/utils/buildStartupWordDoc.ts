import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { STARTUP_TWENTY_CRITERIA } from './startupTwentyCriteria';
import type { QuestionnaireItem, TwentyCriteriaEvaluation } from './startupEvaluationTypes';

export type { QuestionnaireItem, TwentyCriteriaEvaluation } from './startupEvaluationTypes';

function titleForCriterion(id: string): string {
  return STARTUP_TWENTY_CRITERIA.find((c) => c.id === id)?.title ?? id;
}

/**
 * Loyiha, savolnoma, 20 mezon — bitta .docx fayl.
 */
export async function buildStartupProjectWordBlob(params: {
  projectTitle: string;
  summary: string;
  description: string;
  questionnaireItems: QuestionnaireItem[];
  answers: Record<string, string>;
  evaluation: TwentyCriteriaEvaluation;
}): Promise<Blob> {
  const rows = params.evaluation.criteria.map(
    (r) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun(titleForCriterion(r.id))] })],
          }),
          new TableCell({
            width: { size: 12, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun(String(r.score_1_to_5))],
              }),
            ],
          }),
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun(r.comment)] })],
          }),
        ],
      })
  );

  const qaBlocks: Paragraph[] = [];
  for (const it of params.questionnaireItems) {
    const ans = (params.answers[it.id] ?? '').trim() || '—';
    qaBlocks.push(
      new Paragraph({
        spacing: { before: 120 },
        children: [new TextRun({ text: it.question, bold: true })],
      })
    );
    if (it.hint) {
      qaBlocks.push(
        new Paragraph({
          children: [new TextRun({ text: `Eslatma: ${it.hint}`, italics: true, size: 20 })],
        })
      );
    }
    qaBlocks.push(new Paragraph({ children: [new TextRun(ans)] }));
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: params.projectTitle || 'Startap loyihasi',
            heading: HeadingLevel.TITLE,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Umumiy ball: ${params.evaluation.overall_0_100}/100 · Bozorga tayyorgarlik: ${params.evaluation.ready_for_market ? 'HA' : 'YO‘Q'}`,
                bold: true,
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 200 },
            text: 'Xulosa',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: params.evaluation.verdict_uz }),

          new Paragraph({
            spacing: { before: 240 },
            text: 'Qisqa tavsif',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: params.summary || '—' }),

          new Paragraph({
            spacing: { before: 240 },
            text: 'Batafsil tavsif',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: params.description || '—' }),

          new Paragraph({
            spacing: { before: 240 },
            text: 'Savolnoma va javoblar',
            heading: HeadingLevel.HEADING_2,
          }),
          ...qaBlocks,

          new Paragraph({
            spacing: { before: 280 },
            text: '20 ta mezon bo‘yicha baho',
            heading: HeadingLevel.HEADING_2,
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: 'Mezon', bold: true })] })],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: 'Ball (1–5)', bold: true })],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: 'Izoh', bold: true })] })],
                  }),
                ],
              }),
              ...rows,
            ],
          }),

          new Paragraph({
            spacing: { before: 400 },
            children: [
              new TextRun({
                text: 'Hujjat avtomatik shakllantirilgan; rasmiy-huquqiy kuchga ega emas.',
                italics: true,
                size: 20,
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export function downloadWordBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

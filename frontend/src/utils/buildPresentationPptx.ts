export type PresentationSlide = {
  title: string;
  bullets: string[];
  notes?: string;
};

export type PresentationDeck = {
  title: string;
  slides: PresentationSlide[];
};

function extractManba(notes: string | undefined): string {
  const raw = (notes || '').trim();
  if (!raw) return '';
  const m = raw.match(/\(Manba:\s*[^)]+\)/i) || raw.match(/Manba:\s*[^\n.]+/i);
  if (!m) return '';
  return m[0].replace(/^\(/, '').replace(/\)$/, '').trim();
}

export async function buildPresentationPptxFile(deck: PresentationDeck): Promise<File> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.author = 'iMentor';
  pptx.title = deck.title.slice(0, 120);

  for (const slide of deck.slides) {
    const s = pptx.addSlide();
    const bullets = slide.bullets.slice(0, 10);
    const manba = extractManba(slide.notes);
    const dense = bullets.some((b) => b.length >= 100) || bullets.length >= 7;
    const fontSize = dense ? 10 : bullets.length >= 6 ? 11 : 12;
    const titleSize = dense ? 16 : 18;

    s.addText(slide.title, {
      x: 0.35,
      y: 0.22,
      w: 9.3,
      h: 0.55,
      fontSize: titleSize,
      bold: true,
      color: '083047',
    });

    if (bullets.length) {
      s.addText(
        bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        {
          x: 0.35,
          y: 0.85,
          w: 9.3,
          h: manba ? 5.7 : 6.0,
          fontSize,
          color: '1c1c1e',
          valign: 'top',
          paraSpaceAfter: dense ? 4 : 6,
        },
      );
    }

    if (manba) {
      s.addText(manba, {
        x: 0.35,
        y: 6.75,
        w: 9.3,
        h: 0.28,
        fontSize: 9,
        italic: true,
        color: '546e7a',
      });
    }

    if (slide.notes?.trim()) {
      s.addNotes(slide.notes.trim());
    }
  }

  const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
  const safeName =
    deck.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 48) || 'taqdimot';
  return new File([blob], `${safeName}.pptx`, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

export type PresentationSlide = {
  title: string;
  bullets: string[];
  notes?: string;
};

export type PresentationDeck = {
  title: string;
  slides: PresentationSlide[];
};

export async function buildPresentationPptxFile(deck: PresentationDeck): Promise<File> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.author = 'iMentor';
  pptx.title = deck.title.slice(0, 120);

  for (const slide of deck.slides) {
    const s = pptx.addSlide();
    s.addText(slide.title, { x: 0.5, y: 0.35, w: 9, h: 0.7, fontSize: 20, bold: true, color: '083047' });
    const bullets = slide.bullets.slice(0, 8);
    if (bullets.length) {
      const fontSize = bullets.length >= 7 ? 12 : bullets.length >= 5 ? 13 : 14;
      s.addText(
        bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        { x: 0.55, y: 1.2, w: 8.9, h: 4.6, fontSize, color: '1c1c1e', valign: 'top' },
      );
    }
    const sourceMatch =
      [...bullets, slide.notes || '']
        .join('\n')
        .match(/\(Manba:\s*[^)]+\)/i) ||
      [...bullets, slide.notes || ''].join('\n').match(/Manba:\s*[^\n)]+/i);
    if (sourceMatch) {
      s.addText(sourceMatch[0].replace(/^\(/, '').replace(/\)$/, ''), {
        x: 0.5,
        y: 6.85,
        w: 9,
        h: 0.3,
        fontSize: 10,
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

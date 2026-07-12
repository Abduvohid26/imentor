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
    s.addText(slide.title, { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 22, bold: true, color: '083047' });
    if (slide.bullets.length) {
      s.addText(
        slide.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        { x: 0.6, y: 1.4, w: 8.8, h: 4.5, fontSize: 14, color: '1c1c1e' },
      );
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

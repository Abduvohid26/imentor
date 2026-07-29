export type PresentationSlide = {
  title: string;
  bullets: string[];
  notes?: string;
};

export type PresentationDeck = {
  title: string;
  slides: PresentationSlide[];
};

function splitManba(notes: string | undefined): { body: string; manba: string } {
  const raw = (notes || '').trim();
  if (!raw) return { body: '', manba: '' };
  const m = raw.match(/\(Manba:\s*[^)]+\)/i) || raw.match(/Manba:\s*[^\n.]+/i);
  if (!m || m.index == null) return { body: raw, manba: '' };
  const manba = m[0].replace(/^\(/, '').replace(/\)$/, '').trim();
  const body = `${raw.slice(0, m.index)}${raw.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
  return { body, manba };
}

export async function buildPresentationPptxFile(deck: PresentationDeck): Promise<File> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.author = 'iMentor';
  pptx.title = deck.title.slice(0, 120);

  for (const slide of deck.slides) {
    const s = pptx.addSlide();
    s.addText(slide.title, {
      x: 0.4,
      y: 0.28,
      w: 9.2,
      h: 0.65,
      fontSize: 18,
      bold: true,
      color: '083047',
    });

    const bullets = slide.bullets.slice(0, 8);
    const { body: notesBody, manba } = splitManba(slide.notes);
    const longBullets = bullets.some((b) => b.length >= 80);
    const fontSize = longBullets || bullets.length >= 7 ? 11 : bullets.length >= 5 ? 12 : 13;

    if (bullets.length) {
      s.addText(
        bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        {
          x: 0.45,
          y: 1.05,
          w: 9.1,
          h: notesBody ? 4.2 : 5.2,
          fontSize,
          color: '1c1c1e',
          valign: 'top',
          paraSpaceAfter: 6,
        },
      );
    }

    // Notes — slaydda ko'rinadigan qo'shimcha matn (faqat speaker notes emas)
    if (notesBody) {
      s.addText(notesBody.slice(0, 600), {
        x: 0.45,
        y: 5.4,
        w: 9.1,
        h: 1.1,
        fontSize: 10,
        italic: true,
        color: '455a64',
        valign: 'top',
      });
    }

    if (manba) {
      s.addText(manba, {
        x: 0.45,
        y: 6.7,
        w: 9.1,
        h: 0.28,
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

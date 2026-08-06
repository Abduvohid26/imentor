export type PresentationSlide = {
  title: string;
  bullets: string[];
  notes?: string;
  /** Ochiq manbadan (Wikimedia Commons) topilgan rasm — data: URL. */
  imageUrl?: string;
  /** Rasm manbasi/muallifi qisqa matni (litsenziya talabiga ko'ra). */
  imageCredit?: string;
};

export type PresentationDeck = {
  title: string;
  slides: PresentationSlide[];
};

/** B uslub — vizual birinchi; rasm joyi slaydma-slayd almashadi. */
const BG = 'F7FBF8';
const TITLE_COLOR = '0F2F24';
const ACCENT = '0D9488';
const SOFT = 'CCFBF1';
const CARD = 'FFFFFF';
const CARD_BORDER = '99F6E4';
const MUTED = '5B6B7A';
const BODY_COLOR = '134E4A';
const WHITE = 'FFFFFF';

type PptxSlide = import('pptxgenjs').default.Slide;
type ImagePlacement = 'left' | 'right' | 'top' | 'bottom';

function isPlaceholderManba(text: string): boolean {
  return /kitob\s*nomi|book\s*name|sahifa[-\s]?bet\b.*\bnomi|page\s*number/i.test(text);
}

function extractManba(notes: string | undefined): string {
  const raw = (notes || '').trim();
  if (!raw) return '';
  const m = raw.match(/\(Manba:\s*[^)]+\)/i) || raw.match(/Manba:\s*[^\n.]+/i);
  if (!m) return '';
  const text = m[0].replace(/^\(/, '').replace(/\)$/, '').trim();
  return isPlaceholderManba(text) ? '' : text;
}

function splitBulletHeadTail(bullet: string): { head: string; tail: string } {
  const m = bullet.match(/^([^:—–-]{3,72})[:—–-]\s*(.+)$/);
  if (m) return { head: m[1].trim(), tail: m[2].trim() };
  if (bullet.length <= 70) return { head: bullet.trim(), tail: '' };
  const cut = bullet.slice(0, 68);
  const sp = cut.lastIndexOf(' ');
  return {
    head: (sp > 24 ? cut.slice(0, sp) : cut).trim(),
    tail: bullet.slice(sp > 24 ? sp : 68).trim(),
  };
}

/** Kontent-slaydlar bo‘yicha rasm joyini aylantiramiz: chap → o‘ng → tepada → pastda. */
function imagePlacementFor(idx: number): ImagePlacement {
  const cycle: ImagePlacement[] = ['left', 'right', 'top', 'bottom'];
  return cycle[(idx - 1) % cycle.length];
}

function addFooter(s: PptxSlide, pageNum: number, total: number): void {
  const year = new Date().getFullYear();
  s.addShape('rect', {
    x: 0,
    y: 7.08,
    w: 13.333,
    h: 0.42,
    fill: { color: SOFT },
    line: { type: 'none' },
  });
  s.addText(`© iMentor · Farg‘ona jamoat salomatligi tibbiyot instituti · ${year}`, {
    x: 0.45,
    y: 7.14,
    w: 10.5,
    h: 0.3,
    fontSize: 9,
    color: MUTED,
    valign: 'middle',
  });
  s.addText(`${pageNum} / ${total}`, {
    x: 11.9,
    y: 7.14,
    w: 1.0,
    h: 0.3,
    fontSize: 9,
    color: MUTED,
    align: 'right',
    valign: 'middle',
  });
}

function addKicker(s: PptxSlide, text: string): void {
  if (!text.trim()) return;
  s.addText(
    [
      { text: text, options: { color: MUTED, bold: true } },
      { text: '   |   iMentor', options: { color: ACCENT, bold: true } },
    ],
    { x: 0.4, y: 0.18, w: 12.5, h: 0.28, fontSize: 10, fontFace: 'Calibri' },
  );
}

function addCard(
  s: PptxSlide,
  x: number,
  y: number,
  w: number,
  h: number,
  fill = CARD,
): void {
  s.addShape('roundRect', {
    x,
    y,
    w,
    h,
    fill: { color: fill },
    line: { color: CARD_BORDER, width: 1 },
  });
}

function addBadge(s: PptxSlide, n: number, x: number, y: number, size = 0.44): void {
  s.addShape('ellipse', {
    x,
    y,
    w: size,
    h: size,
    fill: { color: ACCENT },
    line: { type: 'none' },
  });
  s.addText(String(n), {
    x,
    y,
    w: size,
    h: size,
    fontSize: size >= 0.5 ? 16 : 13,
    bold: true,
    color: WHITE,
    align: 'center',
    valign: 'middle',
    fontFace: 'Georgia',
  });
}

function addManba(s: PptxSlide, manba: string, y = 6.72): void {
  if (!manba) return;
  s.addText(manba, {
    x: 0.4,
    y,
    w: 12.5,
    h: 0.28,
    fontSize: 10,
    italic: true,
    color: MUTED,
  });
}

function addImagePanel(
  s: PptxSlide,
  opts: {
    data: string;
    credit?: string;
    x: number;
    y: number;
    w: number;
    h: number;
  },
): void {
  addCard(s, opts.x, opts.y, opts.w, opts.h, SOFT);
  const pad = 0.18;
  try {
    s.addImage({
      data: opts.data,
      x: opts.x + pad,
      y: opts.y + pad,
      w: opts.w - pad * 2,
      h: opts.h - pad * 2 - (opts.credit ? 0.32 : 0),
      sizing: {
        type: 'contain',
        w: opts.w - pad * 2,
        h: opts.h - pad * 2 - (opts.credit ? 0.32 : 0),
      },
    });
  } catch {
    /* rasm buzilgan bo'lsa panel qoladi */
  }
  if (opts.credit) {
    s.addText(opts.credit.slice(0, 140), {
      x: opts.x + pad,
      y: opts.y + opts.h - 0.38,
      w: opts.w - pad * 2,
      h: 0.28,
      fontSize: 8,
      italic: true,
      color: MUTED,
    });
  }
}

function addBulletCards(
  s: PptxSlide,
  bullets: string[],
  box: { x: number; y: number; w: number; h: number },
  max = 5,
): void {
  const items = bullets.slice(0, max);
  if (!items.length) return;
  const gap = 0.12;
  const rowH = Math.min(0.95, (box.h - gap * (items.length - 1)) / items.length);
  items.forEach((b, i) => {
    const y = box.y + i * (rowH + gap);
    const { head, tail } = splitBulletHeadTail(b);
    addCard(s, box.x, y, box.w, rowH);
    addBadge(s, i + 1, box.x + 0.16, y + rowH / 2 - 0.22, 0.44);
    s.addText(head, {
      x: box.x + 0.75,
      y: y + 0.08,
      w: box.w - 0.95,
      h: tail ? 0.28 : rowH - 0.16,
      fontSize: 13,
      bold: true,
      color: TITLE_COLOR,
      valign: tail ? 'top' : 'middle',
    });
    if (tail) {
      s.addText(tail.slice(0, 220), {
        x: box.x + 0.75,
        y: y + 0.38,
        w: box.w - 0.95,
        h: rowH - 0.46,
        fontSize: 11.5,
        color: BODY_COLOR,
        valign: 'top',
      });
    }
  });
}

function renderAgenda(s: PptxSlide, slide: PresentationSlide): void {
  s.addText(slide.title, {
    x: 0.45,
    y: 0.55,
    w: 12.4,
    h: 0.6,
    fontSize: 28,
    bold: true,
    color: TITLE_COLOR,
    fontFace: 'Georgia',
  });
  s.addText('Dars rejasi — har bo‘lim keyingi slaydlarda vizual bilan ochiladi', {
    x: 0.45,
    y: 1.2,
    w: 12.4,
    h: 0.3,
    fontSize: 13,
    color: MUTED,
  });

  const bullets = slide.bullets.slice(0, 6);
  const startY = 1.65;
  const gap = 0.12;
  const rowH = Math.min(0.78, (6.55 - startY - gap * (bullets.length - 1)) / Math.max(bullets.length, 1));
  bullets.forEach((b, i) => {
    const y = startY + i * (rowH + gap);
    const { head, tail } = splitBulletHeadTail(b);
    addCard(s, 0.45, y, 12.4, rowH);
    addBadge(s, i + 1, 0.65, y + rowH / 2 - 0.26, 0.52);
    s.addText(head, {
      x: 1.4,
      y: y + 0.08,
      w: 11.2,
      h: 0.3,
      fontSize: 15,
      bold: true,
      color: TITLE_COLOR,
    });
    if (tail) {
      s.addText(tail.slice(0, 160), {
        x: 1.4,
        y: y + 0.38,
        w: 11.2,
        h: rowH - 0.44,
        fontSize: 12,
        color: MUTED,
      });
    }
  });
}

function renderVisualFirst(
  s: PptxSlide,
  slide: PresentationSlide,
  placement: ImagePlacement,
  manba: string,
): void {
  const bullets = slide.bullets.slice(0, 5);
  const img = slide.imageUrl!;
  const credit = slide.imageCredit;

  if (placement === 'left' || placement === 'right') {
    const imgX = placement === 'left' ? 0.35 : 6.0;
    const textX = placement === 'left' ? 7.7 : 0.4;
    addImagePanel(s, { data: img, credit, x: imgX, y: 0.5, w: 5.55, h: 6.05 });
    s.addText(slide.title, {
      x: textX,
      y: 0.5,
      w: 5.2,
      h: 0.65,
      fontSize: 20,
      bold: true,
      color: TITLE_COLOR,
      fontFace: 'Georgia',
    });
    s.addShape('rect', {
      x: textX,
      y: 1.2,
      w: 1.6,
      h: 0.05,
      fill: { color: ACCENT },
      line: { type: 'none' },
    });
    addBulletCards(s, bullets, { x: textX, y: 1.4, w: 5.2, h: 4.9 }, 5);
  } else if (placement === 'top') {
    s.addText(slide.title, {
      x: 0.4,
      y: 0.45,
      w: 12.5,
      h: 0.45,
      fontSize: 22,
      bold: true,
      color: TITLE_COLOR,
      fontFace: 'Georgia',
    });
    addImagePanel(s, { data: img, credit, x: 0.4, y: 1.0, w: 12.5, h: 2.85 });
    // Pastda 2–3 ustunli kartochkalar
    const items = bullets.slice(0, 6);
    const cols = items.length <= 3 ? items.length : 3;
    const gap = 0.18;
    const cardW = (12.5 - gap * (cols - 1)) / cols;
    const cardH = 2.35;
    const startY = 4.05;
    items.forEach((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      if (row > 0) return; // bitta qator — joy yetarli
      const x = 0.4 + col * (cardW + gap);
      const { head, tail } = splitBulletHeadTail(b);
      addCard(s, x, startY, cardW, cardH);
      addBadge(s, i + 1, x + 0.18, startY + 0.2, 0.42);
      s.addText(head, {
        x: x + 0.75,
        y: startY + 0.18,
        w: cardW - 0.95,
        h: 0.45,
        fontSize: 13,
        bold: true,
        color: TITLE_COLOR,
      });
      s.addText((tail || b).slice(0, 180), {
        x: x + 0.2,
        y: startY + 0.75,
        w: cardW - 0.4,
        h: cardH - 0.95,
        fontSize: 12,
        color: BODY_COLOR,
        valign: 'top',
      });
    });
  } else {
    // bottom — matn yuqorida, katta rasm pastda
    s.addText(slide.title, {
      x: 0.4,
      y: 0.45,
      w: 12.5,
      h: 0.45,
      fontSize: 22,
      bold: true,
      color: TITLE_COLOR,
      fontFace: 'Georgia',
    });
    const items = bullets.slice(0, 4);
    const cols = Math.min(4, items.length);
    const gap = 0.16;
    const cardW = (12.5 - gap * (cols - 1)) / cols;
    items.forEach((b, i) => {
      const x = 0.4 + i * (cardW + gap);
      const { head, tail } = splitBulletHeadTail(b);
      addCard(s, x, 1.05, cardW, 1.85);
      addBadge(s, i + 1, x + 0.15, 1.2, 0.4);
      s.addText(head, {
        x: x + 0.65,
        y: 1.18,
        w: cardW - 0.85,
        h: 0.4,
        fontSize: 12.5,
        bold: true,
        color: TITLE_COLOR,
      });
      s.addText((tail || b).slice(0, 140), {
        x: x + 0.15,
        y: 1.7,
        w: cardW - 0.3,
        h: 1.05,
        fontSize: 11.5,
        color: BODY_COLOR,
        valign: 'top',
      });
    });
    addImagePanel(s, { data: img, credit, x: 0.4, y: 3.1, w: 12.5, h: 3.4 });
  }

  addManba(s, manba, 6.72);
}

function renderTextOnly(s: PptxSlide, slide: PresentationSlide, manba: string): void {
  s.addText(slide.title, {
    x: 0.45,
    y: 0.55,
    w: 12.4,
    h: 0.55,
    fontSize: 24,
    bold: true,
    color: TITLE_COLOR,
    fontFace: 'Georgia',
  });
  s.addShape('rect', {
    x: 0.45,
    y: 1.15,
    w: 1.8,
    h: 0.05,
    fill: { color: ACCENT },
    line: { type: 'none' },
  });
  addBulletCards(
    s,
    slide.bullets,
    { x: 0.45, y: 1.4, w: 12.4, h: manba ? 5.0 : 5.3 },
    7,
  );
  addManba(s, manba);
}

export async function buildPresentationPptxFile(deck: PresentationDeck): Promise<File> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.author = 'iMentor';
  pptx.title = deck.title.slice(0, 120);
  pptx.layout = 'LAYOUT_WIDE';

  const total = deck.slides.length;
  const kicker =
    deck.title.length > 70 ? `${deck.title.slice(0, 67)}...` : deck.title;

  deck.slides.forEach((slide, idx) => {
    const s = pptx.addSlide();
    s.background = { color: BG };
    const pageNum = idx + 1;
    const isFirst = idx === 0;
    const manba = extractManba(slide.notes);
    const hasImage = Boolean(slide.imageUrl) && !isFirst;

    addKicker(s, kicker);

    if (isFirst) {
      renderAgenda(s, slide);
      addManba(s, manba);
    } else if (hasImage) {
      renderVisualFirst(s, slide, imagePlacementFor(idx), manba);
    } else {
      renderTextOnly(s, slide, manba);
    }

    if (slide.notes?.trim()) {
      s.addNotes(slide.notes.trim());
    }
    addFooter(s, pageNum, total);
  });

  const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
  const safeName =
    deck.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 48) || 'taqdimot';
  return new File([blob], `${safeName}.pptx`, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

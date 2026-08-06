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

// ---------------- Brand — iMentor korporativ uslub (16:9, kicker + raqamli
// belgilar + footer) ----------------
const BG = 'F6FAFD';
const TITLE_COLOR = '083047';
const ACCENT = '0284C7';
const MUTED = '5B6B7A';
const BODY_COLOR = '1C2733';
const KICKER_COLOR = '5B7A8C';
const WHITE = 'FFFFFF';

/** AI ba'zan haqiqiy kitob topilmasa ham ko'rsatma ichidagi NAMUNA matnini
 * ("kitob nomi, sahifa-bet") o'zgarishsiz qaytarib yuboradi — bu haqiqiy
 * manba emas, shuning uchun soxta/to'ldirilmagan namunalar filtrlanadi. */
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

/** Har bir bullet matnidan mumkin bo'lsa qisqa "sarlavha" va qolgan tavsifni
 * ajratadi (birinchi ":" yoki "—" gacha) — agenda-uslub kartochkalar uchun. */
function splitBulletHeadTail(bullet: string): { head: string; tail: string } {
  const m = bullet.match(/^([^:—–-]{3,60})[:—–-]\s*(.+)$/);
  if (m) return { head: m[1].trim(), tail: m[2].trim() };
  return { head: bullet.slice(0, 60).trim(), tail: '' };
}

function addFooter(s: import('pptxgenjs').default.Slide, pageNum: number, total: number): void {
  const year = new Date().getFullYear();
  s.addText(`© iMentor · Farg‘ona jamoat salomatligi tibbiyot instituti · ${year}`, {
    x: 0.5,
    y: 7.02,
    w: 10.5,
    h: 0.3,
    fontSize: 9,
    color: MUTED,
    valign: 'middle',
  });
  s.addText(`${pageNum} / ${total}`, {
    x: 12.0,
    y: 7.02,
    w: 0.83,
    h: 0.3,
    fontSize: 9,
    color: MUTED,
    align: 'right',
    valign: 'middle',
  });
}

function addKicker(s: import('pptxgenjs').default.Slide, text: string): void {
  if (!text.trim()) return;
  s.addText(
    [
      { text: text, options: { color: KICKER_COLOR, bold: true } },
      { text: '   |   iMentor', options: { color: ACCENT, bold: true } },
    ],
    { x: 0.5, y: 0.32, w: 12.3, h: 0.35, fontSize: 11, fontFace: 'Calibri' },
  );
}

export async function buildPresentationPptxFile(deck: PresentationDeck): Promise<File> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.author = 'iMentor';
  pptx.title = deck.title.slice(0, 120);
  pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in (16:9)

  const total = deck.slides.length;

  deck.slides.forEach((slide, idx) => {
    const s = pptx.addSlide();
    s.background = { color: BG };
    const pageNum = idx + 1;
    const isFirst = idx === 0;
    const isLast = idx === total - 1;
    const bullets = slide.bullets.slice(0, 10);
    const manba = extractManba(slide.notes);
    const hasImage = Boolean(slide.imageUrl) && !isFirst;

    addKicker(s, deck.title.length > 70 ? `${deck.title.slice(0, 67)}...` : deck.title);

    if (isFirst) {
      // ---- Sarlavha/reja slaydi: katta title + agenda-uslub raqamli
      // belgilar (namuna: doira ichida raqam + sarlavha + tavsif) ----
      s.addText(slide.title, {
        x: 0.5,
        y: 0.85,
        w: 12.3,
        h: 0.95,
        fontSize: 32,
        bold: true,
        color: TITLE_COLOR,
        fontFace: 'Georgia',
      });

      const cardCount = Math.min(bullets.length, 6);
      if (cardCount > 0) {
        const startY = 2.05;
        const rowH = (6.55 - startY) / cardCount;
        bullets.slice(0, cardCount).forEach((b, i) => {
          const y = startY + i * rowH;
          const { head, tail } = splitBulletHeadTail(b);
          s.addShape('ellipse', {
            x: 0.7,
            y: y + rowH / 2 - 0.31,
            w: 0.62,
            h: 0.62,
            fill: { color: ACCENT },
            line: { type: 'none' },
          });
          s.addText(String(i + 1), {
            x: 0.7,
            y: y + rowH / 2 - 0.31,
            w: 0.62,
            h: 0.62,
            fontSize: 20,
            bold: true,
            color: WHITE,
            align: 'center',
            valign: 'middle',
            fontFace: 'Georgia',
          });
          s.addText(head, {
            x: 1.55,
            y: y + 0.03,
            w: 12.0,
            h: 0.36,
            fontSize: 15,
            bold: true,
            color: TITLE_COLOR,
          });
          if (tail) {
            s.addText(tail, {
              x: 1.55,
              y: y + 0.38,
              w: 12.0,
              h: rowH - 0.42,
              fontSize: 12.5,
              color: MUTED,
              valign: 'top',
            });
          }
        });
      }
    } else {
      // ---- Kontent slayd ----
      const textW = hasImage ? 6.3 : 12.3;
      const dense = bullets.some((b) => b.length >= 100) || bullets.length >= 7;
      const fontSize = hasImage ? Math.max(10, dense ? 12 : 13) : dense ? 12 : bullets.length >= 6 ? 13 : 14;
      const titleSize = isLast ? 28 : dense ? 20 : 22;

      s.addText(slide.title, {
        x: 0.5,
        y: 0.78,
        w: 12.3,
        h: 0.7,
        fontSize: titleSize,
        bold: true,
        color: TITLE_COLOR,
        fontFace: 'Georgia',
      });
      s.addShape('line', {
        x: 0.5,
        y: 1.5,
        w: hasImage ? 6.1 : 2.0,
        h: 0,
        line: { color: ACCENT, width: 2 },
      });

      if (bullets.length) {
        s.addText(
          bullets.map((b) => ({
            text: b,
            options: { bullet: { code: '2022', indent: 18 }, breakLine: true, color: BODY_COLOR },
          })),
          {
            x: 0.5,
            y: 1.7,
            w: textW,
            h: manba ? 4.85 : 5.15,
            fontSize,
            valign: 'top',
            paraSpaceAfter: dense ? 5 : 8,
            lineSpacingMultiple: 1.12,
          },
        );
      }

      if (hasImage && slide.imageUrl) {
        try {
          s.addImage({
            data: slide.imageUrl,
            x: 6.95,
            y: 1.75,
            w: 3.9,
            h: 3.9,
            sizing: { type: 'contain', w: 3.9, h: 3.9 },
          });
          if (slide.imageCredit) {
            s.addText(slide.imageCredit, {
              x: 6.95,
              y: 5.72,
              w: 3.9,
              h: 0.4,
              fontSize: 7.5,
              italic: true,
              color: MUTED,
              valign: 'top',
            });
          }
        } catch {
          /* rasm noto'g'ri bo'lsa ham slayd matnsiz qolmasin */
        }
      }

      if (manba) {
        s.addText(manba, {
          x: 0.5,
          y: 6.6,
          w: 12.3,
          h: 0.32,
          fontSize: 9.5,
          italic: true,
          color: MUTED,
        });
      }
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

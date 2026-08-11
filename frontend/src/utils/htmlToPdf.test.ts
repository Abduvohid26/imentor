import { describe, expect, it } from 'vitest';
import { planPageCuts } from './htmlToPdf';

const PAGE = 1000;

describe('planPageCuts', () => {
  it('blok chegarasidan kesadi — savol/javob ikkiga bo\'linmaydi', () => {
    // Bloklar: 0-400, 400-900, 900-1400 …
    const blocks = [400, 900, 1400, 1900];
    const pages = planPageCuts({ canvasHeight: 1900, pagePx: PAGE, blocks, elements: [] });
    expect(pages).toEqual([
      { start: 0, end: 900 },
      { start: 900, end: 1900 },
    ]);
  });

  it('blok sig\'masa — ichki element (qator) chegarasidan kesadi', () => {
    const blocks = [2500];
    const elements = [300, 600, 950, 1250, 1600];
    const pages = planPageCuts({ canvasHeight: 2500, pagePx: PAGE, blocks, elements });
    expect(pages[0].end).toBe(950);
    expect(pages[1].end).toBe(1600);
  });

  it('hech qanday chegara yo\'q bo\'lsa — rasmdagi toza qatorga tushadi', () => {
    const pages = planPageCuts({
      canvasHeight: 2000,
      pagePx: PAGE,
      blocks: [],
      elements: [],
      findClean: (maxEnd) => maxEnd - 40,
    });
    expect(pages[0].end).toBe(960);
  });

  it('juda kalta sahifa yasamaydi (chegara sahifa boshiga juda yaqin bo\'lsa)', () => {
    // 100 — sahifaning 10% i; unga tushib qolsa sahifa deyarli bo'sh chiqardi.
    const pages = planPageCuts({ canvasHeight: 1500, pagePx: PAGE, blocks: [100], elements: [] });
    expect(pages[0].end).toBe(PAGE);
  });

  it('sahifalar uzluksiz va butun balandlikni qoplaydi', () => {
    const pages = planPageCuts({
      canvasHeight: 3333,
      pagePx: PAGE,
      blocks: [420, 880, 1310, 2100, 2900],
      elements: [150, 300, 700, 1500, 1800, 2400, 3000],
    });
    expect(pages[0].start).toBe(0);
    expect(pages[pages.length - 1].end).toBe(3333);
    pages.forEach((p, i) => {
      expect(p.end).toBeGreaterThan(p.start);
      expect(p.end - p.start).toBeLessThanOrEqual(PAGE);
      if (i > 0) expect(p.start).toBe(pages[i - 1].end);
    });
  });

  it('bo\'sh kontentda cheksiz siklga tushmaydi', () => {
    expect(planPageCuts({ canvasHeight: 0, pagePx: PAGE, blocks: [], elements: [] })).toEqual([]);
  });
});

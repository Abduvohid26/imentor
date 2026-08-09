import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  RotateCcw,
  Loader2,
  Square,
  MousePointer2,
  Pencil,
  Eraser,
} from 'lucide-react';
import { pdfjsLib } from '../utils/pdfjsSetup';
import { useUiText } from '../i18n/useUiText';

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

type PdfDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

/**
 * Dars o'tish uchun mo'ljallangan slayd ko'ruvchi — brauzerning o'z ichki
 * PDF panelidan farqli o'laroq, katta oldinga/orqaga tugmalari, sahifa
 * hisoblagichi, zoom (+/-) va to'liq ekran rejimi bilan. Sahifa avval
 * ekran kengligiga moslab ko'rsatiladi (fit-to-width), keyin o'qituvchi
 * kerak bo'lsa yaqinlashtirishi mumkin.
 */
export default function PdfSlideViewer({ fileUrl }: { fileUrl: string }) {
  const { t } = useUiText();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PdfDoc | null>(null);
  const renderTokenRef = useRef(0);

  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState<number | null>(null); // null = auto (fit width) hali hisoblanmagan
  const [autoScale, setAutoScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Dars o'tish vositalari ---
  /** Qora ekran (PowerPoint'dagi "B") — talabalar e'tiborini o'qituvchiga qaratish. */
  const [blackout, setBlackout] = useState(false);
  /** 'none' — oddiy, 'pointer' — laser ko'rsatkich, 'draw' — slayd ustida chizish. */
  const [tool, setTool] = useState<'none' | 'pointer' | 'draw'>('none');
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  // PDF hujjatini yuklash
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setNumPages(0);
    setPageNum(1);
    setScale(null);
    (async () => {
      try {
        const doc = await pdfjsLib.getDocument(fileUrl).promise;
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [fileUrl]);

  const computeFitScale = useCallback(async () => {
    const doc = docRef.current;
    const container = containerRef.current;
    if (!doc || !container) return 1;
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const availableWidth = container.clientWidth - 24;
      const availableHeight = container.clientHeight - 24;
      const fitW = availableWidth / viewport.width;
      const fitH = availableHeight / viewport.height;
      return Math.max(MIN_SCALE, Math.min(fitW, fitH));
    } catch {
      return 1;
    }
  }, [pageNum]);

  // Sahifani chizish
  const renderPage = useCallback(
    async (effectiveScale: number) => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;
      const token = ++renderTokenRef.current;
      try {
        const page = await doc.getPage(pageNum);
        if (token !== renderTokenRef.current) return;
        const viewport = page.getViewport({ scale: effectiveScale });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      } catch {
        /* rendering bekor qilingan bo'lishi mumkin — e'tiborsiz qoldiramiz */
      }
    },
    [pageNum],
  );

  // Sahifa o'zgarganda: fit-scale hisoblab (agar auto bo'lsa) chizamiz
  useEffect(() => {
    if (!numPages) return;
    let cancelled = false;
    (async () => {
      const fit = await computeFitScale();
      if (cancelled) return;
      setAutoScale(fit);
      const effective = scale ?? fit;
      await renderPage(effective);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNum, numPages]);

  // Zoom o'zgarganda qayta chizish (sahifa almashmasdan)
  useEffect(() => {
    if (!numPages || scale == null) return;
    void renderPage(scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // Konteyner o'lchami o'zgarsa (masalan fullscreen), auto-fit qayta hisoblansin
  useEffect(() => {
    const onResize = () => {
      if (scale != null) return; // foydalanuvchi qo'lda zoom qilgan bo'lsa, avto-fit bilan ustidan yozmaymiz
      void (async () => {
        const fit = await computeFitScale();
        setAutoScale(fit);
        await renderPage(fit);
      })();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, computeFitScale, renderPage]);

  const goPrev = useCallback(() => setPageNum((p) => Math.max(1, p - 1)), []);
  const goNext = useCallback(() => setPageNum((p) => Math.min(numPages, p + 1)), [numPages]);
  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, (s ?? autoScale) + SCALE_STEP));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, (s ?? autoScale) - SCALE_STEP));
  const resetZoom = () => setScale(null);

  /** Chizma qatlamini asosiy canvas o'lchamiga moslab tozalaydi. */
  const clearDrawing = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx?.clearRect(0, 0, overlay.width, overlay.height);
  }, []);

  // Sahifa yoki masshtab o'zgarsa — chizma qatlami o'lchami moslanadi va
  // eski chizma tozalanadi (chizma aynan o'sha slaydga tegishli).
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    const ctx = overlay.getContext('2d');
    ctx?.clearRect(0, 0, overlay.width, overlay.height);
  }, [pageNum, scale, autoScale, numPages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Qora ekran yoqilganda faqat undan chiqish tugmalari ishlaydi.
      if (blackout) {
        if (k === 'b' || e.key === 'Escape') {
          e.preventDefault();
          setBlackout(false);
        }
        return;
      }
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
      else if (k === 'b') {
        e.preventDefault();
        setBlackout(true);
      } else if (k === 'l') {
        setTool((prev) => (prev === 'pointer' ? 'none' : 'pointer'));
      } else if (k === 'd') {
        setTool((prev) => (prev === 'draw' ? 'none' : 'draw'));
      } else if (k === 'c') {
        clearDrawing();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, blackout, clearDrawing]);

  /** Sichqoncha koordinatasini chizma canvas ichidagi nuqtaga o'giradi. */
  const overlayPoint = (e: React.MouseEvent): { x: number; y: number } | null => {
    const overlay = overlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((e.clientX - rect.left) / rect.width) * overlay.width,
      y: ((e.clientY - rect.top) / rect.height) * overlay.height,
    };
  };

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    if (tool !== 'draw') return;
    const p = overlayPoint(e);
    if (!p) return;
    drawingRef.current = true;
    const ctx = overlayRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const handleOverlayMouseMove = (e: React.MouseEvent) => {
    if (tool === 'pointer') {
      const rect = overlayRef.current?.getBoundingClientRect();
      if (rect) setPointerPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      return;
    }
    if (tool !== 'draw' || !drawingRef.current) return;
    const p = overlayPoint(e);
    const ctx = overlayRef.current?.getContext('2d');
    if (!p || !ctx) return;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const endDrawing = () => {
    drawingRef.current = false;
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current?.requestFullscreen();
    }
  };

  const effectiveScale = scale ?? autoScale;
  const zoomPct = Math.round(effectiveScale && autoScale ? (effectiveScale / autoScale) * 100 : 100);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex flex-col bg-gray-900 ${isFullscreen ? 'p-0' : 'rounded-lg overflow-hidden'}`}
    >
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-3">
        {loading ? (
          <Loader2 className="animate-spin text-white/70" size={40} />
        ) : error ? (
          <p className="text-white/70 text-sm">{t('presentation.previewDownload')}</p>
        ) : (
          // Slayd + uning ustidagi chizma/ko'rsatkich qatlami bir joyda turadi.
          <div className="relative shadow-2xl">
            <canvas ref={canvasRef} className="block bg-white" />
            <canvas
              ref={overlayRef}
              onMouseDown={handleOverlayMouseDown}
              onMouseMove={handleOverlayMouseMove}
              onMouseUp={endDrawing}
              onMouseLeave={() => {
                endDrawing();
                setPointerPos(null);
              }}
              className={`absolute inset-0 w-full h-full ${
                tool === 'draw'
                  ? 'cursor-crosshair'
                  : tool === 'pointer'
                    ? 'cursor-none'
                    : 'pointer-events-none'
              }`}
            />
            {tool === 'pointer' && pointerPos && (
              <span
                className="pointer-events-none absolute z-10 block w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-red-500/70 ring-4 ring-red-500/25"
                style={{ left: pointerPos.x, top: pointerPos.y }}
              />
            )}
          </div>
        )}
      </div>

      {/* Qora ekran — butun ko'ruvchini yopadi (B yoki bosish bilan chiqiladi) */}
      {blackout && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setBlackout(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setBlackout(false);
          }}
          className="absolute inset-0 z-30 bg-black flex items-end justify-center pb-10 cursor-pointer"
        >
          <p className="text-white/35 text-sm select-none">{t('presentation.blackScreenHint')}</p>
        </div>
      )}

      {!loading && !error && numPages > 0 && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-2.5 px-3 bg-black/40 backdrop-blur-sm flex-wrap">
          <button
            type="button"
            onClick={goPrev}
            disabled={pageNum <= 1}
            className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white disabled:opacity-30"
            aria-label={t('presentation.prevSlide')}
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-white text-sm font-semibold tabular-nums px-2 min-w-[60px] text-center">
            {pageNum} / {numPages}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={pageNum >= numPages}
            className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white disabled:opacity-30"
            aria-label={t('presentation.nextSlide')}
          >
            <ChevronRight size={20} />
          </button>

          <span className="w-px h-6 bg-white/20 mx-1" />

          <button
            type="button"
            onClick={zoomOut}
            disabled={effectiveScale <= MIN_SCALE}
            className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white disabled:opacity-30"
            aria-label={t('presentation.zoomOut')}
          >
            <ZoomOut size={18} />
          </button>
          <span className="text-white text-xs font-semibold tabular-nums min-w-[42px] text-center">{zoomPct}%</span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={effectiveScale >= MAX_SCALE}
            className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white disabled:opacity-30"
            aria-label={t('presentation.zoomIn')}
          >
            <ZoomIn size={18} />
          </button>
          {scale != null && (
            <button
              type="button"
              onClick={resetZoom}
              className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white"
              aria-label={t('presentation.resetZoom')}
            >
              <RotateCcw size={16} />
            </button>
          )}

          <span className="w-px h-6 bg-white/20 mx-1" />

          {/* Dars vositalari: ko'rsatkich (L), chizish (D), tozalash (C), qora ekran (B) */}
          <button
            type="button"
            onClick={() => setTool((p) => (p === 'pointer' ? 'none' : 'pointer'))}
            className={`p-2.5 rounded-full text-white ${
              tool === 'pointer' ? 'bg-red-500 hover:bg-red-400' : 'bg-white/15 hover:bg-white/25'
            }`}
            aria-label={t('presentation.pointer')}
            title={t('presentation.pointer')}
          >
            <MousePointer2 size={18} />
          </button>
          <button
            type="button"
            onClick={() => setTool((p) => (p === 'draw' ? 'none' : 'draw'))}
            className={`p-2.5 rounded-full text-white ${
              tool === 'draw' ? 'bg-red-500 hover:bg-red-400' : 'bg-white/15 hover:bg-white/25'
            }`}
            aria-label={t('presentation.draw')}
            title={t('presentation.draw')}
          >
            <Pencil size={18} />
          </button>
          <button
            type="button"
            onClick={clearDrawing}
            className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white"
            aria-label={t('presentation.clearDrawing')}
            title={t('presentation.clearDrawing')}
          >
            <Eraser size={18} />
          </button>
          <button
            type="button"
            onClick={() => setBlackout(true)}
            className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white"
            aria-label={t('presentation.blackScreen')}
            title={t('presentation.blackScreen')}
          >
            <Square size={18} />
          </button>

          <span className="w-px h-6 bg-white/20 mx-1" />

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white"
            aria-label={t('presentation.fullscreen')}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      )}
    </div>
  );
}

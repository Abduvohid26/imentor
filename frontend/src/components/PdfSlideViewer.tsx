import React, { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, Square, MousePointer2, Pencil, Eraser } from 'lucide-react';
import { useUiText } from '../i18n/useUiText';

/**
 * Dars o'tish uchun slayd ko'ruvchi.
 *
 * PDF'ning o'zini BRAUZERNING ICHKI ko'ruvchisi chizadi (`<iframe>`) — u
 * eskizlar panelini, sahifa raqamini, zoom va chop etishni allaqachon beradi
 * va har qanday PDF'ni ishonchli ochadi. Biz ustiga faqat dars uchun kerakli
 * vositalarni qo'shamiz: qora ekran, laser ko'rsatkich, chizish, to'liq ekran.
 *
 * Avval bu komponent PDF'ni pdf.js bilan canvas'ga o'zi chizardi — lekin
 * ba'zi PDF'larda pdf.js xato berib, foydalanuvchiga qora ekran ko'rinardi
 * (o'sha PDF brauzerning o'z ko'ruvchisida esa muammosiz ochilardi).
 */
export default function PdfSlideViewer({ fileUrl }: { fileUrl: string }) {
  const { t } = useUiText();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Qora ekran (PowerPoint'dagi "B") — talabalar e'tiborini o'qituvchiga qaratish. */
  const [blackout, setBlackout] = useState(false);
  /** 'none' — PDF bilan oddiy ishlash, 'pointer' — laser, 'draw' — chizish. */
  const [tool, setTool] = useState<'none' | 'pointer' | 'draw'>('none');
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);

  const clearDrawing = () => {
    const overlay = overlayRef.current;
    const ctx = overlay?.getContext('2d');
    if (overlay && ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
  };

  // Chizma qatlamini konteyner o'lchamiga moslab turamiz (fullscreen/resize).
  useEffect(() => {
    const resize = () => {
      const overlay = overlayRef.current;
      const box = containerRef.current;
      if (!overlay || !box) return;
      // Mavjud chizmani saqlab qolamiz.
      const prev = document.createElement('canvas');
      prev.width = overlay.width;
      prev.height = overlay.height;
      prev.getContext('2d')?.drawImage(overlay, 0, 0);

      overlay.width = box.clientWidth;
      overlay.height = box.clientHeight;
      if (prev.width && prev.height) {
        overlay.getContext('2d')?.drawImage(prev, 0, 0, overlay.width, overlay.height);
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Klaviatura: B — qora ekran, L — ko'rsatkich, D — chizish, C — tozalash.
  // Eslatma: fokus PDF (iframe) ichida bo'lsa brauzer klaviatura hodisasini
  // bizga bermaydi — shuning uchun pastdagi tugmalar asosiy boshqaruv.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (blackout) {
        if (k === 'b' || e.key === 'Escape') {
          e.preventDefault();
          setBlackout(false);
        }
        return;
      }
      if (k === 'b') {
        e.preventDefault();
        setBlackout(true);
      } else if (k === 'l') {
        setTool((p) => (p === 'pointer' ? 'none' : 'pointer'));
      } else if (k === 'd') {
        setTool((p) => (p === 'draw' ? 'none' : 'draw'));
      } else if (k === 'c') {
        clearDrawing();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blackout]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen();
  };

  const overlayPoint = (e: React.MouseEvent) => {
    const overlay = overlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool !== 'draw') return;
    const p = overlayPoint(e);
    const ctx = overlayRef.current?.getContext('2d');
    if (!p || !ctx) return;
    drawingRef.current = true;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tool === 'pointer') {
      setPointerPos(overlayPoint(e));
      return;
    }
    if (tool !== 'draw' || !drawingRef.current) return;
    const p = overlayPoint(e);
    const ctx = overlayRef.current?.getContext('2d');
    if (!p || !ctx) return;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const toolActive = tool !== 'none';

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex flex-col bg-gray-900 ${
        isFullscreen ? 'p-0' : 'rounded-lg overflow-hidden'
      }`}
    >
      <div className="flex-1 min-h-0 relative">
        {/* PDF — brauzerning ichki ko'ruvchisi (eskizlar, zoom, sahifa raqami) */}
        <iframe
          src={fileUrl}
          title={t('presentation.slideLabel')}
          className="w-full h-full border-0 bg-gray-900"
        />

        {/* Chizma / ko'rsatkich qatlami — vosita tanlanmagan bo'lsa PDF bilan
            ishlashga xalaqit bermaydi (pointer-events: none). */}
        <canvas
          ref={overlayRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={() => {
            drawingRef.current = false;
          }}
          onMouseLeave={() => {
            drawingRef.current = false;
            setPointerPos(null);
          }}
          className={`absolute inset-0 w-full h-full ${
            tool === 'draw' ? 'cursor-crosshair' : tool === 'pointer' ? 'cursor-none' : 'pointer-events-none'
          }`}
        />

        {tool === 'pointer' && pointerPos && (
          <span
            className="pointer-events-none absolute z-10 block w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-red-500/70 ring-4 ring-red-500/25"
            style={{ left: pointerPos.x, top: pointerPos.y }}
          />
        )}
      </div>

      {/* Dars vositalari paneli */}
      <div className="shrink-0 flex items-center justify-center gap-2 py-2.5 px-3 bg-black/50 backdrop-blur-sm flex-wrap">
        <button
          type="button"
          onClick={() => setTool((p) => (p === 'pointer' ? 'none' : 'pointer'))}
          className={`p-2.5 rounded-full text-white ${
            tool === 'pointer' ? 'bg-red-500 hover:bg-red-400' : 'bg-white/15 hover:bg-white/25'
          }`}
          title={t('presentation.pointer')}
          aria-label={t('presentation.pointer')}
        >
          <MousePointer2 size={18} />
        </button>
        <button
          type="button"
          onClick={() => setTool((p) => (p === 'draw' ? 'none' : 'draw'))}
          className={`p-2.5 rounded-full text-white ${
            tool === 'draw' ? 'bg-red-500 hover:bg-red-400' : 'bg-white/15 hover:bg-white/25'
          }`}
          title={t('presentation.draw')}
          aria-label={t('presentation.draw')}
        >
          <Pencil size={18} />
        </button>
        <button
          type="button"
          onClick={clearDrawing}
          className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white"
          title={t('presentation.clearDrawing')}
          aria-label={t('presentation.clearDrawing')}
        >
          <Eraser size={18} />
        </button>

        <span className="w-px h-6 bg-white/20 mx-1" />

        <button
          type="button"
          onClick={() => setBlackout(true)}
          className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white"
          title={t('presentation.blackScreen')}
          aria-label={t('presentation.blackScreen')}
        >
          <Square size={18} />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white"
          title={t('presentation.fullscreen')}
          aria-label={t('presentation.fullscreen')}
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>

        {toolActive && (
          <span className="text-white/60 text-xs ml-1 select-none">
            {tool === 'draw' ? t('presentation.draw') : t('presentation.pointer')}
          </span>
        )}
      </div>

      {/* Qora ekran — hamma narsani yopadi */}
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
    </div>
  );
}

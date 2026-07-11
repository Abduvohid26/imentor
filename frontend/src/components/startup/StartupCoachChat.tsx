import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import { useUiText } from '../../i18n/useUiText';

export type CoachTurn = { role: 'user' | 'assistant'; content: string; ts?: number };

export default function StartupCoachChat({
  turns,
  disabled,
  sending,
  onSend,
  analysisReady = true,
  suggestedPrompts = [],
}: {
  turns: CoachTurn[];
  disabled: boolean;
  sending: boolean;
  onSend: (text: string) => Promise<void>;
  analysisReady?: boolean;
  suggestedPrompts?: string[];
}) {
  const { t } = useUiText();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns.length, sending]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || disabled || sending) return;
    setInput('');
    await onSend(text);
  };

  return (
    <div className="rounded-2xl border border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50/90 via-white to-violet-50/60 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl bg-fuchsia-600 text-white flex items-center justify-center shadow-md">
          <MessageCircle size={18} />
        </div>
        <div>
          <h4 className="text-[14px] font-bold text-black/90">{t('startup.coachTitle')}</h4>
          <p className="text-[11px] text-black/50">{t('startup.coachSubtitle')}</p>
        </div>
      </div>

      {suggestedPrompts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {suggestedPrompts.map((q) => (
            <button
              key={q}
              type="button"
              disabled={disabled || sending}
              onClick={() => setInput(q)}
              className="rounded-lg border border-fuchsia-200/90 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-fuchsia-900 hover:bg-fuchsia-50 disabled:opacity-45 text-left max-w-full"
            >
              {q.length > 72 ? `${q.slice(0, 70)}…` : q}
            </button>
          ))}
        </div>
      )}

      <div className="max-h-[min(55vh,520px)] overflow-y-auto space-y-3 rounded-xl border border-black/8 bg-white/70 px-3 py-3 mb-3">
        {turns.length === 0 && (
          <div className="text-[12px] text-black/45 text-center py-5 space-y-2 px-1">
            <p>{analysisReady ? t('startup.coachReady') : t('startup.coachNoAnalysis')}</p>
          </div>
        )}
        {turns.map((m, i) => (
          <div
            key={`${m.role}-${m.ts ?? i}`}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                m.role === 'user'
                  ? 'bg-fuchsia-600 text-white rounded-br-md'
                  : 'bg-white border border-black/10 text-black/85 rounded-bl-md'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-black/10 bg-white px-3 py-2 flex items-center gap-2 text-[12px] text-black/50">
              <Loader2 className="animate-spin size-4" />
              {t('startup.coachTyping')}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled || sending}
          rows={2}
          placeholder={t('startup.coachPlaceholder')}
          className="flex-1 rounded-xl border border-black/12 bg-white/90 px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-fuchsia-400/40 resize-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || sending || !input.trim()}
          className="self-end shrink-0 h-11 w-11 rounded-xl bg-fuchsia-600 text-white flex items-center justify-center shadow-md disabled:opacity-40"
          aria-label={t('startup.coachSend')}
        >
          {sending ? <Loader2 className="animate-spin size-5" /> : <Send size={20} />}
        </button>
      </form>
    </div>
  );
}

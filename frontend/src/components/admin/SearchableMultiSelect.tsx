import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import type { Option } from './SearchableSelect';

/** Ko‘p tanlovli searchable select — chip + checkbox list. */
export default function SearchableMultiSelect({
  value,
  onChange,
  options,
  placeholder,
  noMatchText,
  disabled,
  selectedCountLabel,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: Option[];
  placeholder: string;
  noMatchText: string;
  disabled?: boolean;
  /** Masalan: "{count} ta tanlandi" */
  selectedCountLabel?: (count: number) => string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedOptions = useMemo(
    () => options.filter((o) => selectedSet.has(o.value)),
    [options, selectedSet],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const parts = q.split(/\s+/).filter(Boolean);
    return options.filter((o) => {
      const hay = (o.searchText || o.label).toLowerCase();
      return parts.every((p) => hay.includes(p));
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (v: string) => {
    if (selectedSet.has(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };

  const summary =
    value.length === 0
      ? ''
      : selectedCountLabel
        ? selectedCountLabel(value.length)
        : `${value.length}`;

  return (
    <div className="relative space-y-1.5" ref={rootRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-multiselectable
          disabled={disabled}
          value={open ? query : summary}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
              inputRef.current?.blur();
            }
            if (e.key === 'Backspace' && !query && value.length > 0) {
              onChange(value.slice(0, -1));
            }
            if (e.key === 'ArrowDown') setOpen(true);
          }}
          className="w-full h-11 pl-3 pr-16 rounded-xl border border-slate-200 bg-white text-[13px] disabled:bg-slate-50"
        />
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {value.length > 0 && !disabled ? (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange([]);
                setQuery('');
                setOpen(true);
                inputRef.current?.focus();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Clear"
            >
              <X size={14} />
            </button>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              if (disabled) return;
              setOpen((v) => !v);
              setQuery('');
              inputRef.current?.focus();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            aria-label="Toggle"
          >
            <ChevronDown size={16} className={open ? 'rotate-180 transition' : 'transition'} />
          </button>
        </div>
      </div>

      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((o) => (
            <span
              key={o.value}
              className="inline-flex items-center gap-1 max-w-full rounded-lg bg-indigo-50 text-indigo-800 text-[11px] font-medium px-2 py-1"
            >
              <span className="truncate">{o.label}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="shrink-0 text-indigo-400 hover:text-indigo-700"
                  aria-label="Remove"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable
          className="absolute z-40 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg text-[13px]"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-slate-400">{noMatchText}</li>
          ) : (
            filtered.map((o) => {
              const checked = selectedSet.has(o.value);
              return (
                <li key={o.value} role="option" aria-selected={checked}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      toggle(o.value);
                      setQuery('');
                      inputRef.current?.focus();
                    }}
                    className={`w-full flex items-center gap-2 text-left px-3 py-2.5 hover:bg-indigo-50 ${
                      checked ? 'bg-indigo-50/80 text-indigo-800' : 'text-slate-700'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {checked ? <Check size={11} strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0 truncate">{o.label}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

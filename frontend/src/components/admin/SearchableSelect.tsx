import { useState } from 'react';

export type Option = { value: string; label: string };

/** Yozib qidirish + tanlash (typeahead) — native select o'rniga. */
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  noMatchText,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
  noMatchText: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value) || null;
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <div className="relative">
      <input
        type="text"
        disabled={disabled}
        value={open ? query : selected?.label ?? ''}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-[13px] disabled:bg-slate-50"
      />
      {open && !disabled && (
        <ul className="absolute z-30 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg text-[13px]">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-slate-400">{noMatchText}</li>
          ) : (
            filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-indigo-50 ${
                    o.value === value ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-700'
                  }`}
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

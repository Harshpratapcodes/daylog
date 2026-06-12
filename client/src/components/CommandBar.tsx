/**
 * The command bar — §5 of the design doc. One line per activity, live parse
 * preview underneath, autocomplete from past activity names. Enter commits.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseLine, ParseError, type ParsedLine } from '@shared/timeParser';
import { suggest, type Category } from '../api';
import type { DraftEntry } from '../hooks/useDraft';

const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export interface CommitPayload {
  parsed: ParsedLine;
  raw: string;
  categoryId: number | null;
}

interface Suggestion {
  name: string; category_id: number; category_name: string;
  category_color: string; typical_duration_min: number;
}

interface Props {
  categories: Category[];
  lastTopLevel: DraftEntry | null;
  editingRaw: string | null;          // when set, the bar is editing an existing entry
  disabled: boolean;
  onCommit: (p: CommitPayload) => string | null;  // returns error message or null
  onCancelEdit: () => void;
  onBarEmptyKey: (key: string, e: React.KeyboardEvent) => void; // ↑/↓/E/Delete pass-through
}

export function resolveCategoryTag(tag: string | null, categories: Category[]): number | null {
  if (!tag) return null;
  const t = tag.toLowerCase().replace(/[_-]/g, ' ');
  const exact = categories.find(c => c.name.toLowerCase() === t);
  if (exact) return exact.id;
  const prefix = categories.find(c => c.name.toLowerCase().startsWith(t));
  if (prefix) return prefix.id;
  const within = categories.find(c => c.name.toLowerCase().includes(t));
  return within ? within.id : null;
}

export default function CommandBar({
  categories, lastTopLevel, editingRaw, disabled, onCommit, onCancelEdit, onBarEmptyKey,
}: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [sugIndex, setSugIndex] = useState(0);
  const [pendingCategory, setPendingCategory] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (editingRaw !== null) {
      setValue(editingRaw);
      setError(null);
      inputRef.current?.focus();
    }
  }, [editingRaw]);

  const ctx = useMemo(() => ({
    parentRange: lastTopLevel ? { startMin: lastTopLevel.startMin, endMin: lastTopLevel.endMin } : null,
    lastEndMin: lastTopLevel?.endMin ?? null,
  }), [lastTopLevel]);

  // Live parse preview on every keystroke (§5.3 rule 2).
  const preview = useMemo<{ ok: ParsedLine | null; err: string | null }>(() => {
    if (!value.trim()) return { ok: null, err: null };
    try {
      return { ok: parseLine(value, ctx), err: null };
    } catch (e) {
      return { ok: null, err: e instanceof ParseError && e.code !== 'NO_TIME_RANGE' ? e.message : null };
    }
  }, [value, ctx]);

  // Autocomplete: fires while typing a name, before any time range parses.
  useEffect(() => {
    window.clearTimeout(debounce.current);
    const q = value.replace(/^>\s*/, '').trim();
    if (preview.ok || q.length < 2 || /\d/.test(q)) { setSugs([]); return; }
    debounce.current = window.setTimeout(async () => {
      try {
        const r = await suggest(q);
        setSugs(r.suggestions);
        setSugIndex(0);
      } catch { setSugs([]); }
    }, 180);
    return () => window.clearTimeout(debounce.current);
  }, [value, preview.ok]);

  const acceptSuggestion = (s: Suggestion) => {
    const nest = value.trimStart().startsWith('>') ? '> ' : '';
    setValue(`${nest}${s.name} `);
    setPendingCategory(s.category_id);
    setSugs([]);
    inputRef.current?.focus();
  };

  const commit = () => {
    if (!preview.ok) {
      if (value.trim()) setError('Add a time range, e.g. 9-11 or 6:30pm-7:30pm');
      return;
    }
    const tagCat = resolveCategoryTag(preview.ok.categoryTag, categories);
    const err = onCommit({
      parsed: preview.ok,
      raw: value,
      categoryId: tagCat ?? pendingCategory,
    });
    if (err) { setError(err); return; }
    setValue('');
    setError(null);
    setPendingCategory(null);
    setSugs([]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (sugs.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSugIndex(i => (i + 1) % sugs.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSugIndex(i => (i - 1 + sugs.length) % sugs.length); return; }
      if (e.key === 'Tab') { e.preventDefault(); acceptSuggestion(sugs[sugIndex]); return; }
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); commit(); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (editingRaw !== null) onCancelEdit();
      setValue(''); setError(null); setSugs([]); setPendingCategory(null);
      return;
    }
    if (value === '' && ['ArrowUp', 'ArrowDown', 'Delete', 'Backspace', 'e', 'E'].includes(e.key)) {
      onBarEmptyKey(e.key, e);
    }
  };

  const p = preview.ok;
  const previewCat =
    p && categories.find(c => c.id === (resolveCategoryTag(p.categoryTag, categories) ?? pendingCategory));

  return (
    <div className="bar-wrap" style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        className="bar-input"
        placeholder={editingRaw !== null ? 'Editing — Enter to save, Esc to cancel' : 'office 9-6   ·   > meetings 11-1 #meet'}
        value={value}
        disabled={disabled}
        onChange={(e) => { setValue(e.target.value); setError(null); }}
        onKeyDown={onKeyDown}
        autoFocus
        aria-label="Log an activity"
      />
      {sugs.length > 0 && (
        <div className="suggest-pop" role="listbox">
          {sugs.map((s, i) => (
            <div
              key={s.name + s.category_id}
              className={`suggest-item${i === sugIndex ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(s); }}
              role="option" aria-selected={i === sugIndex}
            >
              <span className="dot" style={{ width: 8, height: 8, borderRadius: 99, background: s.category_color }} />
              {s.name}
              <span className="dur">~{s.typical_duration_min}m</span>
            </div>
          ))}
        </div>
      )}
      <div className={`ghost-line${error || preview.err ? ' err' : ''}`} aria-live="polite">
        {error || preview.err ? (
          <span>{error ?? preview.err}</span>
        ) : p ? (
          <>
            {p.nest && <span className="nest-mark">└ in {lastTopLevel?.name ?? '—'}</span>}
            <span>{p.name}</span>
            <span className="times">
              {fmt(p.startMin)} → {p.overnight ? `${fmt(p.endMin)} (+1 day, splits at midnight)` : fmt(p.endMin)}
            </span>
            {previewCat && (
              <span className="cat-chip" style={{ marginLeft: 0 }}>
                <span className="dot" style={{ background: previewCat.color }} />{previewCat.name}
              </span>
            )}
          </>
        ) : (
          <span style={{ opacity: 0.55 }}>name + time range · &gt; nests under the last activity · #tag sets category</span>
        )}
      </div>
      <div className="hint-row">
        <kbd>Enter</kbd> commit · <kbd>Tab</kbd> autocomplete · <kbd>↑↓</kbd> select · <kbd>E</kbd> edit · <kbd>⌫</kbd> delete · <kbd>Ctrl+D</kbd> duplicate yesterday · <kbd>Ctrl+Enter</kbd> finalize
      </div>
    </div>
  );
}

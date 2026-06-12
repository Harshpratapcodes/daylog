import { useEffect, useState } from 'react';
import type { Category } from '../api';
import type { DraftEntry } from '../hooks/useDraft';
import type { CommitPayload } from './CommandBar';

interface Props {
  categories: Category[];
  lastTopLevel: DraftEntry | null;
  editingEntry: DraftEntry | null;
  disabled: boolean;
  onCommit: (p: CommitPayload) => string | null;
  onCancelEdit: () => void;
}

function minToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function timeToMin(t: string): number | null {
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0], 10);
  const min = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

export default function FormBar({ categories, lastTopLevel, editingEntry, disabled, onCommit, onCancelEdit }: Props) {
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [nest, setNest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingEntry) {
      setName(editingEntry.name);
      setStartTime(minToTime(editingEntry.startMin));
      setEndTime(minToTime(editingEntry.endMin));
      setCategoryId(editingEntry.categoryId);
      setNest(editingEntry.parentId !== null);
    } else {
      setName(''); setStartTime(''); setEndTime(''); setCategoryId(null); setNest(false);
    }
    setError(null);
  }, [editingEntry]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Activity name is required'); return; }
    const startMin = timeToMin(startTime);
    const endMin = timeToMin(endTime);
    if (startMin === null) { setError('Enter a valid start time'); return; }
    if (endMin === null) { setError('Enter a valid end time'); return; }
    if (nest && !lastTopLevel) { setError('Nothing to nest under — log a top-level activity first'); return; }

    const overnight = endMin <= startMin;
    const raw = `${nest ? '> ' : ''}${trimmedName} ${startTime}-${endTime}`;

    const err = onCommit({
      parsed: { nest, name: trimmedName, startMin, endMin, categoryTag: null, overnight },
      raw,
      categoryId,
    });
    if (err) { setError(err); return; }
    setName(''); setStartTime(''); setEndTime(''); setCategoryId(null); setNest(false); setError(null);
  };

  return (
    <form className="form-bar" onSubmit={submit}>
      <div className="form-bar-fields">
        <input
          className="form-field form-field-name"
          placeholder="Activity name"
          value={name}
          onChange={e => { setName(e.target.value); setError(null); }}
          disabled={disabled}
          autoFocus
        />
        <div className="form-time-range">
          <input
            className="form-field form-field-time mono"
            type="time"
            value={startTime}
            onChange={e => { setStartTime(e.target.value); setError(null); }}
            disabled={disabled}
            aria-label="Start time"
          />
          <span className="form-time-sep">→</span>
          <input
            className="form-field form-field-time mono"
            type="time"
            value={endTime}
            onChange={e => { setEndTime(e.target.value); setError(null); }}
            disabled={disabled}
            aria-label="End time"
          />
        </div>
        <select
          className="form-field form-field-cat"
          value={categoryId ?? ''}
          onChange={e => { setCategoryId(e.target.value ? Number(e.target.value) : null); setError(null); }}
          disabled={disabled}
          aria-label="Category"
        >
          <option value="">— category —</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="form-bar-foot">
        <label className="form-nest-label">
          <input
            type="checkbox"
            checked={nest}
            onChange={e => setNest(e.target.checked)}
            disabled={disabled || !lastTopLevel}
          />
          sub-activity under <b>{lastTopLevel?.name ?? '—'}</b>
        </label>
        {error && <span className="msg err">{error}</span>}
        <span className="spacer" />
        {editingEntry ? (
          <>
            <button type="button" className="ghost" onClick={onCancelEdit}>Cancel</button>
            <button type="submit" className="primary" disabled={disabled}>Save</button>
          </>
        ) : (
          <button type="submit" className="primary" disabled={disabled}>Add activity</button>
        )}
      </div>
    </form>
  );
}

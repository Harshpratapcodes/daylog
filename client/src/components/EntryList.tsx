import type { DraftEntry } from '../hooks/useDraft';
import type { Category } from '../api';

const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const fmtDur = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;

interface Props {
  entries: DraftEntry[];
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCycleCategory: (id: string) => void;
  onEdit?: (id: string) => void;
  keyboardMode?: boolean;
}

export default function EntryList({ entries, categories, selectedId, onSelect, onCycleCategory, onEdit, keyboardMode }: Props) {
  // Render in logged order, children directly under their parent.
  const tops = entries.filter(e => e.parentId === null);
  const ordered: DraftEntry[] = tops.flatMap(t => [t, ...entries.filter(e => e.parentId === t.id)]);

  if (ordered.length === 0) {
    return (
      <div className="empty-state">
        {keyboardMode ? (
          <>
            Reconstruct your day, one line at a time.<br />
            Try <span className="mono">office 9-6</span>, then <span className="mono">&gt; meetings 11-1 #meet</span> to nest.
          </>
        ) : (
          <>Fill in the form above to start logging your day.</>
        )}
      </div>
    );
  }

  return (
    <div className="entries">
      {ordered.map(e => {
        const cat = categories.find(c => c.id === e.categoryId);
        return (
          <div
            key={e.id}
            className={`entry-row${e.parentId ? ' child' : ''}${e.id === selectedId ? ' selected' : ''}${onEdit ? ' editable' : ''}`}
            onClick={() => onSelect(e.id)}
            onDoubleClick={() => onEdit?.(e.id)}
            title={onEdit ? 'Double-click to edit' : undefined}
          >
            <span className="times">{fmt(e.startMin)}–{fmt(e.endMin)}</span>
            <span className="name">{e.name}</span>
            <span className="dur">{fmtDur(e.endMin - e.startMin)}</span>
            <button
              className={`cat-chip${cat ? '' : ' unset'}`}
              onClick={(ev) => { ev.stopPropagation(); onCycleCategory(e.id); }}
              title={cat ? 'Click to change category' : 'No category yet — click to set'}
            >
              {cat ? <><span className="dot" style={{ background: cat.color }} />{cat.name}</> : 'set category'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

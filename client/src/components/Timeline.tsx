/**
 * The day spine — a vertical 24h SVG. Parent activities render full-width in
 * their category color; children render inset on top (leaf attribution made
 * visible). Unaccounted time is hatched: the texture of an unexamined hour.
 */
import { useEffect, useMemo, useState } from 'react';
import type { DraftEntry } from '../hooks/useDraft';
import type { Category } from '../api';

const W = 380;
const PX_PER_MIN = 0.52;
const TOP = 14;
const H = 1440 * PX_PER_MIN + TOP * 2;
const SPINE_X = 56;
const SPINE_W = W - SPINE_X - 10;
const CHILD_INSET = 56;

const y = (min: number) => TOP + min * PX_PER_MIN;
const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

interface Props {
  entries: DraftEntry[];
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** When true (viewing today), an amber "now" line marks the current minute. */
  today?: boolean;
}

const minutesNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

function useNowMin(active: boolean): number | null {
  const [now, setNow] = useState(minutesNow);
  useEffect(() => {
    if (!active) return;
    setNow(minutesNow());
    const id = window.setInterval(() => setNow(minutesNow()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);
  return active ? now : null;
}

export default function Timeline({ entries, categories, selectedId, onSelect, today }: Props) {
  const nowMin = useNowMin(Boolean(today));
  const catColor = (id: number | null) =>
    categories.find(c => c.id === id)?.color ?? 'var(--amber)';

  const tops = useMemo(
    () => entries.filter(e => e.parentId === null).sort((a, b) => a.startMin - b.startMin),
    [entries]
  );
  const childrenOf = (id: string) =>
    entries.filter(e => e.parentId === id).sort((a, b) => a.startMin - b.startMin);

  const gaps = useMemo(() => {
    const out: Array<[number, number]> = [];
    let cursor = 0;
    for (const t of tops) {
      if (t.startMin > cursor) out.push([cursor, t.startMin]);
      cursor = Math.max(cursor, t.endMin);
    }
    if (cursor < 1440) out.push([cursor, 1440]);
    return out;
  }, [tops]);

  const block = (e: DraftEntry, isChild: boolean) => {
    const x = SPINE_X + (isChild ? CHILD_INSET : 0);
    const w = SPINE_W - (isChild ? CHILD_INSET : 0);
    const h = Math.max((e.endMin - e.startMin) * PX_PER_MIN, 3);
    const color = catColor(e.categoryId);
    const selected = e.id === selectedId;
    const showText = h >= 15;
    return (
      <g key={e.id} onClick={(ev) => { ev.stopPropagation(); onSelect(e.id); }} style={{ cursor: 'pointer' }}>
        <rect
          x={x} y={y(e.startMin)} width={w} height={h} rx={3}
          fill={color} fillOpacity={isChild ? 0.42 : 0.22}
          stroke={selected ? 'var(--text)' : e.categoryId === null ? 'var(--amber)' : 'none'}
          strokeWidth={selected ? 1.5 : 1}
          strokeDasharray={e.categoryId === null && !selected ? '3 3' : undefined}
        />
        <rect x={x} y={y(e.startMin)} width={2.5} height={h} fill={color} />
        {showText && (
          <>
            <text className="tl-block-label" x={x + 9} y={y(e.startMin) + 12.5}>
              {e.name.length > 28 ? e.name.slice(0, 27) + '…' : e.name}
            </text>
            {h >= 28 && (
              <text className="tl-block-time" x={x + 9} y={y(e.startMin) + 24}>
                {fmt(e.startMin)}–{fmt(e.endMin)}
              </text>
            )}
          </>
        )}
        <title>{e.name} · {fmt(e.startMin)}–{fmt(e.endMin)}</title>
      </g>
    );
  };

  return (
    <svg
      className="timeline-svg" viewBox={`0 0 ${W} ${H}`}
      onClick={() => onSelect(null)} role="img" aria-label="Day timeline"
    >
      <defs>
        <pattern id="hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--line)" strokeWidth="1.4" />
        </pattern>
      </defs>

      {/* hour grid */}
      {Array.from({ length: 25 }, (_, h) => (
        <g key={h}>
          <line x1={SPINE_X} x2={SPINE_X + SPINE_W} y1={y(h * 60)} y2={y(h * 60)}
            stroke="var(--line)" strokeWidth={h % 6 === 0 ? 0.9 : 0.45} />
          {h % 2 === 0 && h < 24 && (
            <text className="tl-hour-label" x={SPINE_X - 8} y={y(h * 60) + 3.5} textAnchor="end">
              {String(h).padStart(2, '0')}:00
            </text>
          )}
        </g>
      ))}

      {/* unaccounted hatching */}
      {gaps.map(([s, e], i) => (
        <rect key={i} x={SPINE_X} y={y(s)} width={SPINE_W} height={(e - s) * PX_PER_MIN}
          fill="url(#hatch)" opacity={0.5} />
      ))}

      {/* blocks: parents, then children on top */}
      {tops.map(t => block(t, false))}
      {tops.flatMap(t => childrenOf(t.id).map(c => block(c, true)))}

      {/* the current minute, when looking at today */}
      {nowMin !== null && (
        <g pointerEvents="none">
          <line x1={SPINE_X - 4} x2={SPINE_X + SPINE_W} y1={y(nowMin)} y2={y(nowMin)}
            stroke="var(--amber)" strokeWidth={1.2} />
          <circle cx={SPINE_X - 4} cy={y(nowMin)} r={3} fill="var(--amber)" />
          <text className="tl-now-label" x={SPINE_X + SPINE_W - 4} y={y(nowMin) - 5} textAnchor="end">
            now · {fmt(nowMin)}
          </text>
        </g>
      )}
    </svg>
  );
}

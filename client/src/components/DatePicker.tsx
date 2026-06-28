/** Themed calendar popover. Tap the date label to jump to any day — no arrow-mashing. */
import { useEffect, useRef, useState } from 'react';
import { isoDate } from '../lib/serverDay';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
};
const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Days (as iso strings, with leading/trailing blanks) for a Monday-first month grid. */
function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(ymd(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function DatePicker(
  { value, label, onChange }: { value: string; label: string; onChange: (iso: string) => void },
) {
  const [open, setOpen] = useState(false);
  const sel = parse(value);
  const [view, setView] = useState({ y: sel.y, m: sel.m }); // month being browsed
  const root = useRef<HTMLDivElement>(null);
  const today = isoDate(new Date());

  // Re-center on the selected month each time the popover opens.
  useEffect(() => { if (open) setView({ y: sel.y, m: sel.m }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const step = (n: number) => setView(v => {
    const d = new Date(Date.UTC(v.y, v.m + n, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });

  const pick = (iso: string) => { onChange(iso); setOpen(false); };

  return (
    <span className="date-pick" ref={root}>
      <button
        className={`date${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Pick a date"
      >
        {label}
      </button>

      {open && (
        <div className="cal" role="dialog" aria-label="Choose a date">
          <div className="cal-head">
            <button className="cal-nav" onClick={() => step(-1)} aria-label="Previous month">←</button>
            <span className="cal-title">{MONTHS[view.m]} {view.y}</span>
            <button className="cal-nav" onClick={() => step(1)} aria-label="Next month">→</button>
          </div>

          <div className="cal-grid cal-dow">
            {WEEKDAYS.map(w => <span key={w} className="cal-dow-cell">{w}</span>)}
          </div>

          <div className="cal-grid">
            {monthGrid(view.y, view.m).map((iso, i) =>
              iso === null
                ? <span key={i} className="cal-cell empty" />
                : (
                  <button
                    key={iso}
                    className={`cal-cell${iso === value ? ' selected' : ''}${iso === today ? ' today' : ''}`}
                    onClick={() => pick(iso)}
                    aria-current={iso === today ? 'date' : undefined}
                  >
                    {Number(iso.slice(8))}
                  </button>
                ),
            )}
          </div>

          <div className="cal-foot">
            <button className="cal-today" onClick={() => pick(today)}>Today</button>
          </div>
        </div>
      )}
    </span>
  );
}

/** Convert a server DayResponse tree into flat draft-style entries (shared by log hydrate, review, week). */
import { localId, type DraftEntry } from '../hooks/useDraft';

export interface ServerDay {
  id: string;
  log_date: string;
  status: 'draft' | 'finalized';
  reflection_note: string | null;
  activities: Array<{
    id: string; name: string;
    category: { id: number; name: string; color: string };
    start_min: number; end_min: number;
    children: Array<{ id: string; name: string; category: { id: number; name: string; color: string }; start_min: number; end_min: number }>;
  }>;
  computed: { total_logged_min: number; unaccounted_min: number; gaps: Array<{ start_min: number; end_min: number }> };
}

export function toEntries(day: ServerDay): DraftEntry[] {
  const out: DraftEntry[] = [];
  for (const a of day.activities) {
    const pid = localId();
    out.push({
      id: pid, raw: a.name, parentId: null, name: a.name,
      startMin: a.start_min, endMin: a.end_min, categoryId: a.category.id, categoryTag: null,
    });
    for (const c of a.children) {
      out.push({
        id: localId(), raw: c.name, parentId: pid, name: c.name,
        startMin: c.start_min, endMin: c.end_min, categoryId: c.category.id, categoryTag: null,
      });
    }
  }
  return out;
}

export const fmtH = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};

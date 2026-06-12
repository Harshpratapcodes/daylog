/** Day review — §7.2: read view of any past day. The mirror, after the fact. */
import { useEffect, useState } from 'react';
import { api, type Category } from '../api';
import { toEntries, fmtH, isoDate, type ServerDay } from '../lib/serverDay';
import type { DraftEntry } from '../hooks/useDraft';
import Timeline from './Timeline';
import Donut from './Donut';

interface DayAnalytics {
  category_breakdown_min: Record<string, number>;
  context_switches: number;
  longest_focus_block_min: number;
}

const weekdayLong = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' });

export default function DayReview({ date, categories }: { date: string; categories: Category[] }) {
  const [day, setDay] = useState<ServerDay | null>(null);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [analytics, setAnalytics] = useState<DayAnalytics | null>(null);
  const [missing, setMissing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setMissing(false); setDay(null); setAnalytics(null); setSelectedId(null);
    Promise.all([api<ServerDay>(`/days/${date}`), api<DayAnalytics & { date: string }>(`/analytics/day/${date}`)])
      .then(([d, a]) => { setDay(d); setEntries(toEntries(d)); setAnalytics(a); })
      .catch(() => setMissing(true));
  }, [date]);

  if (missing) {
    return (
      <div className="empty-center">
        <div className="empty-state" style={{ textAlign: 'center' }}>
          No log for <span className="mono">{date}</span>.<br />
          The mirror only shows recorded days — use ← → above to find one.
        </div>
      </div>
    );
  }
  if (!day || !analytics) {
    return <div className="empty-center"><div className="empty-state">Loading…</div></div>;
  }

  const covered = Math.round((day.computed.total_logged_min / 1440) * 100);

  return (
    <>
      <div className="subbar">
        <span className={`status-pill ${day.status}`}>{day.status}</span>
        <div className="stats">
          <span>logged <b>{fmtH(day.computed.total_logged_min)}</b></span>
          <span>day covered <b>{covered}%</b></span>
        </div>
        <span className="subbar-right">{weekdayLong(date)}</span>
      </div>
      <div className="review-grid">
        <section className="review-tl">
          <Timeline entries={entries} categories={categories} selectedId={selectedId} onSelect={setSelectedId}
            today={date === isoDate(new Date())} />
        </section>
        <aside className="review-side">
          <div className="tiles">
            <div className="tile">
              <div className="tile-num mono">{analytics.context_switches}</div>
              <div className="tile-label">context switches</div>
            </div>
            <div className="tile">
              <div className="tile-num mono">{fmtH(analytics.longest_focus_block_min)}</div>
              <div className="tile-label">longest focus block</div>
            </div>
            <div className="tile">
              <div className="tile-num mono">{fmtH(day.computed.unaccounted_min)}</div>
              <div className="tile-label">unaccounted</div>
            </div>
          </div>
          <div>
            <h3 className="section-h sub" style={{ margin: '0 0 12px' }}>Where it went</h3>
            <Donut breakdown={analytics.category_breakdown_min} categories={categories} />
          </div>
          {day.reflection_note && (
            <div className="note-card">
              <div className="note-label">reflection</div>
              <p>{day.reflection_note}</p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

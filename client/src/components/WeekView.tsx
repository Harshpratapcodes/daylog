/** Week view — §7.3: summary numbers, the skyline, where the hours went, switches, recurring. */
import { useEffect, useMemo, useState } from 'react';
import { api, type Category } from '../api';
import { addDays, fmtH, isoDate, type ServerDay } from '../lib/serverDay';

interface RangeAnalytics {
  series: Array<{ date: string; category_breakdown_min: Record<string, number>; context_switches: number; longest_focus_block_min: number }>;
  category_totals_min: Record<string, number>;
  recurring_activities: Array<{ name: string; total_min: number; sessions: number; avg_session_min: number }>;
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (date: string) => WD[new Date(date + 'T12:00:00Z').getUTCDay()];
const hoursShort = (min: number) => {
  const h = min / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
};

/* ── Mini skyline: one slim 24h strip per day, with 06/12/18 reference ticks ── */
function MiniDay({ day, categories, today }: { day: ServerDay | null; categories: Category[]; today: boolean }) {
  const W = 44, H = 208, px = H / 1440;
  const color = (id: number) => categories.find(c => c.id === id)?.color ?? 'var(--text-faint)';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mini-day" role="img"
      aria-label={day ? `${day.log_date}: ${fmtH(day.computed.total_logged_min)} logged` : 'No log'}>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} fill="var(--ink-1)" rx="5"
        stroke={today ? 'rgba(217, 164, 91, 0.4)' : 'var(--line)'} />
      {[360, 720, 1080].map(m => (
        <line key={m} x1={3} x2={W - 3} y1={m * px} y2={m * px} stroke="var(--line)" strokeWidth="0.7" />
      ))}
      {day?.activities.map(a => (
        <g key={a.id}>
          <rect x={4} y={a.start_min * px} width={W - 8} height={Math.max((a.end_min - a.start_min) * px, 1.5)}
            fill={color(a.category.id)} fillOpacity={0.45} rx={1.5} />
          {a.children.map(c => (
            <rect key={c.id} x={15} y={c.start_min * px} width={W - 19} height={Math.max((c.end_min - c.start_min) * px, 1.5)}
              fill={color(c.category.id)} fillOpacity={0.85} rx={1.5} />
          ))}
        </g>
      ))}
      {day && <title>{day.log_date} · {fmtH(day.computed.total_logged_min)} logged</title>}
    </svg>
  );
}

/* ── Switch-count sparkline, weekday-labelled ── */
function Sparkline({ points, labels }: { points: Array<number | null>; labels: string[] }) {
  const W = 340, H = 76, P = 12, LBL = 16;
  const max = Math.max(4, ...points.filter((p): p is number => p !== null));
  const x = (i: number) => P + (i * (W - P * 2)) / Math.max(points.length - 1, 1);
  const y = (v: number) => H - P - LBL - (v / max) * (H - P * 2 - LBL);
  const segs: string[] = [];
  let path = '';
  points.forEach((p, i) => {
    if (p === null) { if (path) segs.push(path); path = ''; return; }
    path += `${path ? 'L' : 'M'}${x(i)},${y(p)} `;
  });
  if (path) segs.push(path);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Context switches per day">
      {segs.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--amber)" strokeWidth="1.6" />)}
      {points.map((p, i) => p !== null && (
        <g key={i}>
          <circle cx={x(i)} cy={y(p)} r="2.6" fill="var(--amber)" />
          <text x={x(i)} y={y(p) - 7} textAnchor="middle" className="spark-num mono">{p}</text>
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={`${l}${i}`} x={x(i)} y={H - 3} textAnchor="middle" className="spark-lbl">{l}</text>
      ))}
    </svg>
  );
}

export default function WeekView({ endDate, categories, onOpenDay }: {
  endDate: string; categories: Category[]; onOpenDay: (date: string) => void;
}) {
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(endDate, i - 6)), [endDate]);
  const [days, setDays] = useState<Record<string, ServerDay | null>>({});
  const [range, setRange] = useState<RangeAnalytics | null>(null);

  useEffect(() => {
    api<RangeAnalytics>(`/analytics/range?from=${dates[0]}&to=${dates[6]}`).then(setRange).catch(() => setRange(null));
    Promise.all(dates.map(d => api<ServerDay>(`/days/${d}`).catch(() => null)))
      .then(rs => setDays(Object.fromEntries(dates.map((d, i) => [d, rs[i]]))));
  }, [dates]);

  const byDate = (d: string) => range?.series.find(s => s.date.slice(0, 10) === d) ?? null;
  const color = (name: string) =>
    name === 'Unaccounted' ? 'var(--line)' : categories.find(c => c.name === name)?.color ?? 'var(--text-faint)';
  const todayIso = isoDate(new Date());

  // Headline numbers: how much, how scattered, how focused.
  const summary = useMemo(() => {
    if (!range || range.series.length === 0) return null;
    const logged = range.series.map(s => 1440 - (s.category_breakdown_min['Unaccounted'] ?? 0));
    const total = logged.reduce((a, b) => a + b, 0);
    return {
      total,
      days: range.series.length,
      avg: Math.round(total / range.series.length),
      switches: range.series.reduce((a, s) => a + s.context_switches, 0),
      bestFocus: Math.max(...range.series.map(s => s.longest_focus_block_min)),
    };
  }, [range]);

  const catTotals = useMemo(() =>
    range
      ? Object.entries(range.category_totals_min)
          .filter(([n, m]) => n !== 'Unaccounted' && m > 0)
          .sort(([, a], [, b]) => b - a)
      : [],
    [range]);
  const catMax = catTotals[0]?.[1] ?? 1;
  const weekLogged = catTotals.reduce((a, [, m]) => a + m, 0) || 1;

  return (
    <div className="week-wrap">
      <h2 className="section-h">The week, as it actually happened</h2>

      {summary && (
        <div className="tiles four">
          <div className="tile">
            <div className="tile-num mono">{fmtH(summary.total)}</div>
            <div className="tile-label">logged across {summary.days} day{summary.days === 1 ? '' : 's'}</div>
          </div>
          <div className="tile">
            <div className="tile-num mono">{fmtH(summary.avg)}</div>
            <div className="tile-label">average per logged day</div>
          </div>
          <div className="tile">
            <div className="tile-num mono">{summary.switches}</div>
            <div className="tile-label">context switches</div>
          </div>
          <div className="tile">
            <div className="tile-num mono">{fmtH(summary.bestFocus)}</div>
            <div className="tile-label">longest focus block</div>
          </div>
        </div>
      )}

      <div className="skyline">
        {dates.map(d => {
          const day = days[d] ?? null;
          return (
            <div
              key={d}
              className={`skyline-col${day ? ' has-log' : ''}${d === todayIso ? ' today' : ''}`}
              onClick={day ? () => onOpenDay(d) : undefined}
              onKeyDown={day ? (e) => { if (e.key === 'Enter') onOpenDay(d); } : undefined}
              role={day ? 'button' : undefined}
              tabIndex={day ? 0 : undefined}
              title={day ? `Open ${d}` : undefined}
            >
              <div className="skyline-head">
                <span>{weekday(d)}</span>
                <span className="mono">{d.slice(8)}</span>
              </div>
              <MiniDay day={day} categories={categories} today={d === todayIso} />
              <div className="skyline-hours mono">{day ? hoursShort(day.computed.total_logged_min) : '·'}</div>
            </div>
          );
        })}
      </div>

      {summary ? (
        <>
          <h3 className="section-h sub">Where the hours went</h3>
          <div className="cat-bars">
            {catTotals.map(([n, m]) => (
              <div key={n} className="cat-bar-row">
                <span className="dot" style={{ background: color(n) }} />
                <span className="legend-name">{n}</span>
                <div className="cat-bar-track">
                  <div className="cat-bar-fill" style={{ width: `${(m / catMax) * 100}%`, background: color(n) }} />
                </div>
                <span className="legend-min mono">{fmtH(m)}</span>
                <span className="cat-share mono">{Math.round((m / weekLogged) * 100)}%</span>
              </div>
            ))}
          </div>

          <h3 className="section-h sub">Context switches per day</h3>
          <Sparkline points={dates.map(d => byDate(d)?.context_switches ?? null)} labels={dates.map(weekday)} />

          <h3 className="section-h sub">What keeps coming back</h3>
          {range && range.recurring_activities.length > 0 ? (
            <table className="recur-table">
              <thead><tr><th>activity</th><th>total</th><th>sessions</th><th>avg session</th></tr></thead>
              <tbody>
                {range.recurring_activities.map(r => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td className="mono">{fmtH(r.total_min)}</td>
                    <td className="mono">{r.sessions}</td>
                    <td className="mono">{fmtH(r.avg_session_min)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state" style={{ padding: '12px 0' }}>
              Nothing recurs yet — patterns appear after a few finalized days.
            </div>
          )}
        </>
      ) : (
        <div className="empty-state" style={{ padding: '22px 0' }}>
          Nothing logged this week yet — finalize a night in <b>Tonight</b> and the patterns appear here.
        </div>
      )}
    </div>
  );
}

/** Category donut — leaf-attributed minutes per category, Unaccounted in hatch-gray. */
import type { Category } from '../api';
import { fmtH } from '../lib/serverDay';

const TAU = Math.PI * 2;

interface Props {
  breakdown: Record<string, number>;   // category name → minutes (includes Unaccounted)
  categories: Category[];
  size?: number;
}

export default function Donut({ breakdown, categories, size = 190 }: Props) {
  const color = (name: string) =>
    name === 'Unaccounted' ? 'var(--line)' : categories.find(c => c.name === name)?.color ?? 'var(--text-faint)';

  const entries = Object.entries(breakdown)
    .filter(([, m]) => m > 0)
    .sort(([a], [b]) => (a === 'Unaccounted' ? 1 : b === 'Unaccounted' ? -1 : breakdown[b] - breakdown[a]));
  const total = entries.reduce((s, [, m]) => s + m, 0) || 1;

  const R = size / 2, r = R - 16, cx = R, cy = R;
  let angle = -Math.PI / 2;

  const arcs = entries.map(([name, min]) => {
    const sweep = (min / total) * TAU;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (a: number, rad: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
    const ri = r - 22;
    const d = sweep >= TAU - 0.001
      ? `M ${p(-Math.PI / 2, r)} A ${r} ${r} 0 1 1 ${p(Math.PI / 2, r)} A ${r} ${r} 0 1 1 ${p(-Math.PI / 2, r)} ` +
        `M ${p(-Math.PI / 2, ri)} A ${ri} ${ri} 0 1 0 ${p(Math.PI / 2, ri)} A ${ri} ${ri} 0 1 0 ${p(-Math.PI / 2, ri)} Z`
      : `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, ri)} A ${ri} ${ri} 0 ${large} 0 ${p(a0, ri)} Z`;
    return { name, min, d };
  });

  const logged = total - (breakdown['Unaccounted'] ?? 0);

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Time by category">
        {arcs.map(a => (
          <path key={a.name} d={a.d} fill={color(a.name)} fillOpacity={a.name === 'Unaccounted' ? 0.55 : 0.8}>
            <title>{a.name}: {fmtH(a.min)}</title>
          </path>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="donut-center mono">{fmtH(logged)}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="donut-sub">logged</text>
      </svg>
      <div className="donut-legend">
        {entries.map(([name, min]) => (
          <div key={name} className="legend-row">
            <span className="dot" style={{ background: color(name) }} />
            <span className="legend-name">{name}</span>
            <span className="legend-min mono">{fmtH(min)}</span>
            <span className="legend-share mono">{Math.round((min / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

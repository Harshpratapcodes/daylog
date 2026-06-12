/**
 * Category color palette — muted hues tuned for the dark ink theme (amber is
 * reserved for UI attention, so it never appears here). The first 9 are the
 * seeds for the default categories; the rest are offered, in order, to new
 * categories so colors never repeat.
 */
export const PALETTE = [
  '#5B8DEF', // blue        — Work / office
  '#9B7EDE', // violet      — Personal project
  '#4CAF82', // green       — Health / fitness
  '#56B3B4', // teal        — Leisure
  '#E07A9B', // rose        — Social / family
  '#A8B061', // olive       — Travel / commute
  '#D96C6C', // red         — Wasted / distracted
  '#7D8CA3', // slate       — Sleep / rest
  '#A09484', // warm gray   — Other
  '#6FAED9', // sky
  '#C77DCF', // orchid
  '#5BC8AF', // mint
  '#8A7FE8', // indigo
  '#E08D6F', // coral
  '#9CC069', // lime
  '#B06C8E', // plum
];

const hexToHue = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
};

const hslToHex = (h: number, s: number, l: number): string => {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const hueDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * The next color for a new category: the first unused palette color, or — once
 * the palette is exhausted — a synthesized hue as far as possible from every
 * color already in use.
 */
export function nextColor(used: string[]): string {
  const taken = new Set(used.map(c => c.toLowerCase()));
  const free = PALETTE.find(c => !taken.has(c.toLowerCase()));
  if (free) return free;

  const usedHues = used.map(hexToHue);
  let best = PALETTE[0];
  let bestDist = -1;
  for (let i = 0; i < 24; i++) {
    const hue = (i * 137.5) % 360; // golden-angle walk spreads candidates evenly
    const dist = Math.min(...usedHues.map(u => hueDist(hue, u)));
    if (dist > bestDist) { bestDist = dist; best = hslToHex(hue, 0.42, 0.62); }
  }
  return best;
}

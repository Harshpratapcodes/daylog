/**
 * Daylog command-bar line parser (Design Doc §5.2–5.3).
 *
 * Grammar:
 *   line         := [">"] name time_range ["#" category_prefix]
 *   time_range   := time ("-" | "–" | "to") time
 *   time         := H | HH | H:MM | HH:MM | H[:MM]am/pm | "noon" | "midnight"
 *
 * Pure function — no I/O, fully unit-testable.
 */

export interface ParseContext {
  /** Range of the targeted parent, when the line begins with ">" (nesting). */
  parentRange?: { startMin: number; endMin: number } | null;
  /** End time of the previous top-level entry — chronological hint for am/pm. */
  lastEndMin?: number | null;
}

export interface ParsedLine {
  nest: boolean;
  name: string;
  startMin: number;
  /** When overnight=true, endMin is minutes into the NEXT day (split at midnight by caller). */
  endMin: number;
  categoryTag: string | null;
  overnight: boolean;
}

export type ParseErrorCode = 'NO_TIME_RANGE' | 'INVALID_TIME' | 'EMPTY_NAME' | 'OUT_OF_PARENT_BOUNDS';

export class ParseError extends Error {
  constructor(public code: ParseErrorCode, message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

interface RawTime {
  minutes: number;       // 0..1440 (1440 only for "midnight" as an end)
  ambiguous: boolean;    // true when am/pm could not be determined from the token
}

const TIME_TOKEN = String.raw`(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)`;
const RANGE_RE = new RegExp(
  `(${TIME_TOKEN})\\s*(?:-|–|\\bto\\b)\\s*(${TIME_TOKEN})`,
  'i'
);

function parseTimeToken(token: string, isEnd: boolean): RawTime {
  const t = token.trim().toLowerCase();
  if (t === 'noon') return { minutes: 720, ambiguous: false };
  if (t === 'midnight') return { minutes: isEnd ? 1440 : 0, ambiguous: false };

  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) throw new ParseError('INVALID_TIME', `Cannot parse time "${token}"`);
  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3];

  if (hour > 23 || min > 59) throw new ParseError('INVALID_TIME', `Invalid time "${token}"`);

  if (meridiem === 'pm') {
    hour = (hour % 12) + 12;
    return { minutes: hour * 60 + min, ambiguous: false };
  }
  if (meridiem === 'am') {
    hour = hour % 12; // 12am -> 0
    let minutes = hour * 60 + min;
    if (isEnd && minutes === 0) minutes = 1440; // "…-12am" ends at midnight
    return { minutes, ambiguous: false };
  }
  // No meridiem. Hours 0 or 13–23 are explicit 24h; 1–12 are ambiguous.
  const ambiguous = hour >= 1 && hour <= 12;
  return { minutes: hour * 60 + min, ambiguous };
}

const within = (s: number, e: number, p: { startMin: number; endMin: number }) =>
  s >= p.startMin && e <= p.endMin;

export function parseLine(raw: string, ctx: ParseContext = {}): ParsedLine {
  let line = raw.trim();
  if (!line) throw new ParseError('EMPTY_NAME', 'Empty line');

  const nest = line.startsWith('>');
  if (nest) line = line.slice(1).trim();

  // Extract category tag (anywhere in the line).
  let categoryTag: string | null = null;
  line = line.replace(/#([\p{L}\p{N}_-]+)/u, (_, tag: string) => {
    categoryTag = tag.toLowerCase();
    return '';
  }).trim();

  const rangeMatch = line.match(RANGE_RE);
  if (!rangeMatch) throw new ParseError('NO_TIME_RANGE', 'No time range found (e.g. "9-6" or "6:30pm-7:30pm")');

  const name = (line.slice(0, rangeMatch.index) + line.slice(rangeMatch.index! + rangeMatch[0].length))
    .trim()
    .replace(/\s{2,}/g, ' ');
  if (!name) throw new ParseError('EMPTY_NAME', 'Activity needs a name before the time range');

  const start = parseTimeToken(rangeMatch[1], false);
  const end = parseTimeToken(rangeMatch[2], true);

  let s = start.minutes;
  let e = end.minutes;
  let overnight = false;

  // Rule 1: a range must end after it starts — bump an ambiguous end by 12h.
  if (e <= s && end.ambiguous && e + 720 > s) e += 720;

  // Rule 4 (nested snapping): try +12h shifts of ambiguous tokens to fit the parent.
  if (nest && ctx.parentRange && !within(s, e, ctx.parentRange)) {
    const candidates: Array<[number, number]> = [];
    if (start.ambiguous && end.ambiguous) candidates.push([s + 720, e + 720]);
    if (!start.ambiguous && end.ambiguous) candidates.push([s, e + 720]);
    if (start.ambiguous && !end.ambiguous) candidates.push([s + 720, e]);
    const fit = candidates.find(([cs, ce]) => ce > cs && ce <= 1440 && within(cs, ce, ctx.parentRange!));
    if (fit) [s, e] = fit;
    else throw new ParseError(
      'OUT_OF_PARENT_BOUNDS',
      `Time range falls outside the parent activity (${fmt(ctx.parentRange.startMin)}–${fmt(ctx.parentRange.endMin)})`
    );
  }

  // Chronological hint for top-level entries: days are logged roughly in order.
  // Only apply when the bumped start lands within 6 h of lastEndMin — prevents
  // early-morning times (e.g. "4-6") from being pushed to 16-18 just because a
  // morning activity was the last thing logged.
  if (!nest && ctx.lastEndMin != null && s < ctx.lastEndMin && start.ambiguous) {
    const s2 = s + 720;
    const e2 = end.ambiguous && e + 720 <= 1440 ? e + 720 : e;
    if (s2 >= ctx.lastEndMin && s2 - ctx.lastEndMin <= 360 && e2 > s2 && e2 <= 1440) { s = s2; e = e2; }
  }

  // Overnight: explicit times where end is still before start (e.g. 11pm-7am).
  if (e <= s) {
    overnight = true;
  }

  if (s < 0 || s >= 1440) throw new ParseError('INVALID_TIME', 'Start time out of range');
  if (!overnight && (e <= 0 || e > 1440)) throw new ParseError('INVALID_TIME', 'End time out of range');

  return { nest, name, startMin: s, endMin: e, categoryTag, overnight };
}

/** Split an overnight parse into today's and tomorrow's segments. */
export function splitOvernight(p: ParsedLine): [
  { startMin: number; endMin: number },
  { startMin: number; endMin: number }
] {
  return [
    { startMin: p.startMin, endMin: 1440 },
    { startMin: 0, endMin: p.endMin },
  ];
}

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

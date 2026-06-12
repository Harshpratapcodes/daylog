/** Dogfood instrumentation — times each nightly logging session locally.
 *  Clock starts at the first committed entry for a date, stops at finalize.
 *  Exit criterion for Phase 1: 14 consecutive nights, median under 7 minutes. */

import { getUserId } from '../api';

const START = (date: string) => `daylog_${getUserId()}_session_start_${date}`;
const LOG = () => `daylog_${getUserId()}_sessions`;

export interface SessionRecord { date: string; seconds: number; finalized_at: string }

export function markSessionStart(date: string) {
  if (!localStorage.getItem(START(date))) {
    localStorage.setItem(START(date), String(Date.now()));
  }
}

export function endSession(date: string): number | null {
  const raw = localStorage.getItem(START(date));
  if (!raw) return null;
  const seconds = Math.round((Date.now() - Number(raw)) / 1000);
  localStorage.removeItem(START(date));
  const log = getSessions().filter(s => s.date !== date);
  log.push({ date, seconds, finalized_at: new Date().toISOString() });
  localStorage.setItem(LOG(), JSON.stringify(log));
  return seconds;
}

export function getSessions(): SessionRecord[] {
  try { return JSON.parse(localStorage.getItem(LOG()) ?? '[]'); } catch { return []; }
}

export function medianSeconds(): number | null {
  const s = getSessions().map(x => x.seconds).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export const fmtSec = (sec: number) =>
  sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;

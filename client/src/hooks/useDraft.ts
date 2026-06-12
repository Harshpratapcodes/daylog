/**
 * Tonight's logging session, held client-side and mirrored to localStorage on
 * every change (Design Doc §8 — draft resilience). Committed to the server in
 * one batch when the user finalizes.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getUserId } from '../api';

export interface DraftEntry {
  id: string;                 // local id
  raw: string;                // original command-bar line (for round-trip editing)
  parentId: string | null;    // local id of parent entry, or null for top-level
  name: string;
  startMin: number;
  endMin: number;
  categoryId: number | null;  // null = needs category (amber)
  categoryTag: string | null;
}

const key = (date: string) => `daylog_${getUserId()}_draft_${date}`;
const carryKey = (date: string) => `daylog_${getUserId()}_carry_${date}`;

export function loadCarry(date: string): Omit<DraftEntry, 'id'> | null {
  try {
    const raw = localStorage.getItem(carryKey(date));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function storeCarry(date: string, entry: Omit<DraftEntry, 'id'>) {
  localStorage.setItem(carryKey(date), JSON.stringify(entry));
}

export function clearCarry(date: string) {
  localStorage.removeItem(carryKey(date));
}

let n = 0;
export const localId = () => `e${Date.now().toString(36)}${(n++).toString(36)}`;

export function useDraft(date: string) {
  const [entries, setEntries] = useState<DraftEntry[]>(() => {
    try {
      const raw = localStorage.getItem(key(date));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  // Date whose draft `entries` currently holds; persisting is gated on it so a
  // date switch can't save the old day's entries under the new day's key.
  const loadedDate = useRef(date);

  // Switch days: reload that day's draft, pulling in any overnight carry.
  useEffect(() => {
    let next: DraftEntry[] = [];
    try {
      const raw = localStorage.getItem(key(date));
      next = raw ? JSON.parse(raw) : [];
    } catch { /* fresh */ }
    if (next.length === 0) {
      const carry = loadCarry(date);
      if (carry) {
        next = [{ ...carry, id: localId() }];
        clearCarry(date);
      }
    }
    loadedDate.current = date;
    setEntries(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useLayoutEffect(() => {
    if (loadedDate.current !== date) return;
    localStorage.setItem(key(date), JSON.stringify(entries));
  }, [date, entries]);

  const lastTopLevel = useMemo(
    () => [...entries].reverse().find(e => e.parentId === null) ?? null,
    [entries]
  );

  const add = (e: DraftEntry) => setEntries(prev => [...prev, e]);
  const replace = (id: string, e: DraftEntry) =>
    setEntries(prev => prev.map(x => (x.id === id ? e : x)));
  const remove = (id: string) =>
    setEntries(prev => prev.filter(x => x.id !== id && x.parentId !== id));
  const setCategory = (id: string, categoryId: number) =>
    setEntries(prev => prev.map(x => (x.id === id ? { ...x, categoryId } : x)));
  const clear = () => setEntries([]);

  return { entries, lastTopLevel, add, replace, remove, setCategory, clear, setEntries };
}

/* ── Client-side mirrors of validation rules V1–V3 (server re-checks on commit) ── */
export function overlapError(
  candidate: { startMin: number; endMin: number },
  siblings: DraftEntry[],
  excludeId: string | null
): DraftEntry | null {
  return (
    siblings.find(
      s => s.id !== excludeId && candidate.startMin < s.endMin && s.startMin < candidate.endMin
    ) ?? null
  );
}

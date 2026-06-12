/**
 * Analytics computations (Design Doc §6).
 * Leaf-attribution principle: every minute belongs to the most specific activity covering it.
 */
import type { TreeNode } from './dayTree.js';

interface MinuteOwner {
  activityId: string | null; // null = unaccounted
  category: string;          // category name; 'Unaccounted' when no activity
}

export function minuteAttribution(roots: TreeNode[]): MinuteOwner[] {
  const minutes: MinuteOwner[] = Array.from({ length: 1440 }, () => ({
    activityId: null,
    category: 'Unaccounted',
  }));
  for (const parent of roots) {
    for (let m = parent.start_min; m < parent.end_min; m++) {
      minutes[m] = { activityId: parent.id, category: parent.category.name };
    }
    for (const child of parent.children) {
      for (let m = child.start_min; m < child.end_min; m++) {
        minutes[m] = { activityId: child.id, category: child.category.name };
      }
    }
  }
  return minutes;
}

/** Minutes per category, leaf-attributed. Includes 'Unaccounted'. */
export function categoryBreakdown(roots: TreeNode[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of minuteAttribution(roots)) out[m.category] = (out[m.category] ?? 0) + 1;
  return out;
}

/**
 * Categories are user-defined (editable, deletable), so analytics can't key on
 * exact names. Restful and wasted time are recognized by word, which covers the
 * defaults ('Sleep / rest', 'Wasted / distracted'), the legacy seeds ('Rest',
 * 'Distraction'), and most renames.
 */
const isRestful = (category: string) => /\b(sleep|rest|nap)\b/i.test(category);
const isWasted = (category: string) => /\b(wasted?|distract\w*|scroll\w*)\b/i.test(category);

/**
 * Context switches: transitions between consecutive distinct activities in the
 * leaf-level sequence, ignoring restful/Unaccounted runs entirely (Design Doc §6).
 * Resuming the same activity after a gap does not count as a switch.
 */
export function contextSwitchCount(roots: TreeNode[]): number {
  const runs: string[] = [];
  let prev: string | null = null;
  for (const m of minuteAttribution(roots)) {
    if (m.activityId === null || m.category === 'Unaccounted' || isRestful(m.category)) { prev = null; continue; }
    if (m.activityId !== prev) { runs.push(m.activityId); prev = m.activityId; }
  }
  let switches = 0;
  for (let i = 1; i < runs.length; i++) if (runs[i] !== runs[i - 1]) switches++;
  return switches;
}

/**
 * Longest unbroken run of minutes on a single activity — restful, wasted, and
 * unaccounted minutes never count as focus and break the run.
 */
export function longestFocusBlockMin(roots: TreeNode[]): number {
  let best = 0;
  let current = 0;
  let prevId: string | null = null;
  for (const m of minuteAttribution(roots)) {
    if (m.activityId !== null && m.category !== 'Unaccounted' && !isRestful(m.category) && !isWasted(m.category)) {
      current = m.activityId === prevId ? current + 1 : 1;
      prevId = m.activityId;
      if (current > best) best = current;
    } else {
      current = 0;
      prevId = null;
    }
  }
  return best;
}

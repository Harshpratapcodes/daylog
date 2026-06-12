import { describe, it, expect } from 'vitest';
import { buildTree, computeGaps, type ActivityRow } from '../src/services/dayTree.js';
import { categoryBreakdown, contextSwitchCount, longestFocusBlockMin } from '../src/services/analytics.js';

/**
 * The design-doc canonical day:
 *   Office (Meetings cat) 09:00–18:00
 *     ├─ Project work (Deep Work) 09:00–11:00
 *     ├─ Sprint planning (Meetings) 11:00–13:00
 *     └─ Scrolling (Distraction) 15:00–16:00
 *   Gym (Personal) 18:30–19:30
 */
const row = (
  id: string, parent: string | null, name: string, s: number, e: number,
  catId: number, catName: string
): ActivityRow => ({
  id, parent_id: parent, name, start_min: s, end_min: e, duration_min: e - s,
  category_id: catId, category_name: catName, category_color: '#000000',
});

const rows: ActivityRow[] = [
  row('office', null, 'Office', 540, 1080, 2, 'Meetings'),
  row('proj', 'office', 'Project work', 540, 660, 1, 'Deep Work'),
  row('sprint', 'office', 'Sprint planning', 660, 780, 2, 'Meetings'),
  row('scroll', 'office', 'Scrolling', 900, 960, 5, 'Distraction'),
  row('gym', null, 'Gym', 1110, 1170, 4, 'Personal'),
];

describe('buildTree + computeGaps', () => {
  it('assembles the nested tree sorted by start time', () => {
    const tree = buildTree(rows);
    expect(tree.map(t => t.id)).toEqual(['office', 'gym']);
    expect(tree[0].children.map(c => c.id)).toEqual(['proj', 'sprint', 'scroll']);
  });

  it('computes gaps and unaccounted time', () => {
    const { gaps, total_logged_min, unaccounted_min } = computeGaps(buildTree(rows));
    expect(gaps).toEqual([
      { start_min: 0, end_min: 540 },
      { start_min: 1080, end_min: 1110 },
      { start_min: 1170, end_min: 1440 },
    ]);
    expect(total_logged_min).toBe(540 + 60);
    expect(unaccounted_min).toBe(1440 - 600);
  });
});

describe('leaf attribution (the honesty rule)', () => {
  it('Office 9–6 containing Scrolling 3–4 reports 1h Distraction, not 9h Meetings', () => {
    const b = categoryBreakdown(buildTree(rows));
    expect(b['Distraction']).toBe(60);
    expect(b['Deep Work']).toBe(120);
    // Office's own minutes = 540 total − 120 deep − 120 sprint − 60 scroll = 240, plus sprint's 120 = 360 Meetings
    expect(b['Meetings']).toBe(360);
    expect(b['Personal']).toBe(60);
    expect(b['Unaccounted']).toBe(1440 - 600);
    expect(Object.values(b).reduce((a, x) => a + x, 0)).toBe(1440); // every minute attributed exactly once
  });
});

describe('context switches', () => {
  it('counts leaf-level transitions, ignoring unaccounted gaps', () => {
    // Leaf sequence: proj → sprint → office(own) → scroll → office(own) → [gap] → gym
    // Switches: proj→sprint, sprint→office, office→scroll, scroll→office, office→gym = 5
    expect(contextSwitchCount(buildTree(rows))).toBe(5);
  });

  it('resuming the same activity after unaccounted time is not a switch', () => {
    const r2 = [
      row('a', null, 'Writing', 540, 600, 1, 'Deep Work'),
      row('b', null, 'Writing2', 660, 720, 1, 'Deep Work'),
    ];
    expect(contextSwitchCount(buildTree(r2))).toBe(1); // a → b is one switch despite the gap
    const r3 = [row('a', null, 'Writing', 540, 600, 1, 'Deep Work')];
    expect(contextSwitchCount(buildTree(r3))).toBe(0);
  });

  it('Rest is excluded from switching', () => {
    const r4 = [
      row('a', null, 'Writing', 540, 600, 1, 'Deep Work'),
      row('nap', null, 'Nap', 600, 660, 6, 'Rest'),
      row('b', null, 'Writing', 660, 720, 1, 'Deep Work'),
    ];
    expect(contextSwitchCount(buildTree(r4))).toBe(1); // a→b across Rest; Rest itself doesn't count
  });
});

describe('longest focus block', () => {
  it('finds the longest unbroken Deep Work run', () => {
    expect(longestFocusBlockMin(buildTree(rows))).toBe(120);
  });
  it('a child interrupting splits the run', () => {
    const r5 = [
      row('deep', null, 'Deep work', 540, 780, 1, 'Deep Work'),
      row('ping', 'deep', 'Slack ping', 600, 615, 5, 'Distraction'),
    ];
    expect(longestFocusBlockMin(buildTree(r5))).toBe(165); // 615–780
  });
});

describe('user-defined category names (categories are renamable/deletable)', () => {
  it('"Sleep / rest" is excluded from switching, like the old "Rest"', () => {
    const r = [
      row('a', null, 'Writing', 540, 600, 1, 'Work / office'),
      row('nap', null, 'Nap', 600, 660, 8, 'Sleep / rest'),
      row('b', null, 'Writing', 660, 720, 1, 'Work / office'),
    ];
    expect(contextSwitchCount(buildTree(r))).toBe(1);
  });

  it('"Wasted / distracted" never counts as focus and splits a focus run', () => {
    const r = [
      row('deep', null, 'Project work', 540, 780, 2, 'Personal project'),
      row('scroll', 'deep', 'Scrolling', 600, 615, 7, 'Wasted / distracted'),
    ];
    expect(longestFocusBlockMin(buildTree(r))).toBe(165); // 615–780
    const onlyScrolling = [row('s', null, 'Scrolling', 540, 900, 7, 'Wasted / distracted')];
    expect(longestFocusBlockMin(buildTree(onlyScrolling))).toBe(0);
  });

  it('focus blocks work for any productive category, not just "Deep Work"', () => {
    const r = [row('gym', null, 'Gym', 540, 630, 3, 'Health / fitness')];
    expect(longestFocusBlockMin(buildTree(r))).toBe(90);
  });
});

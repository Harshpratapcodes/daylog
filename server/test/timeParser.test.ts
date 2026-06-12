import { describe, it, expect } from 'vitest';
import { parseLine, splitOvernight, ParseError } from '../../shared/timeParser.js';

const OFFICE = { startMin: 540, endMin: 1080 }; // 09:00–18:00

describe('timeParser — design doc §5.2 examples', () => {
  it('office 9-6 → 09:00–18:00 (ambiguous end bumped +12h)', () => {
    const p = parseLine('office 9-6');
    expect(p).toMatchObject({ nest: false, name: 'office', startMin: 540, endMin: 1080, overnight: false });
  });

  it('> sprint planning 11-1 #meet → child, 11:00–13:00, tag "meet"', () => {
    const p = parseLine('> sprint planning 11-1 #meet', { parentRange: OFFICE });
    expect(p).toMatchObject({ nest: true, name: 'sprint planning', startMin: 660, endMin: 780, categoryTag: 'meet' });
  });

  it('> scrolling 3-3:30 #dis → snapped into parent → 15:00–15:30', () => {
    const p = parseLine('> scrolling 3-3:30 #dis', { parentRange: OFFICE });
    expect(p).toMatchObject({ startMin: 900, endMin: 930, categoryTag: 'dis' });
  });

  it('gym 6:30pm-7:30pm #personal → 18:30–19:30', () => {
    const p = parseLine('gym 6:30pm-7:30pm #personal');
    expect(p).toMatchObject({ name: 'gym', startMin: 1110, endMin: 1170, categoryTag: 'personal' });
  });

  it('sleep 11pm-7am → overnight, split at midnight', () => {
    const p = parseLine('sleep 11pm-7am');
    expect(p.overnight).toBe(true);
    const [today, tomorrow] = splitOvernight(p);
    expect(today).toEqual({ startMin: 1380, endMin: 1440 });
    expect(tomorrow).toEqual({ startMin: 0, endMin: 420 });
  });
});

describe('timeParser — disambiguation rules §5.3', () => {
  it('chronological hint: gym 6:30-7:30 after office ending 18:00 → evening', () => {
    const p = parseLine('gym 6:30-7:30', { lastEndMin: 1080 });
    expect(p).toMatchObject({ startMin: 1110, endMin: 1170 });
  });

  it('no hint: breakfast 8-8:30 stays morning', () => {
    const p = parseLine('breakfast 8-8:30');
    expect(p).toMatchObject({ startMin: 480, endMin: 510 });
  });

  it('no hint: early-morning range not bumped when last activity ended in the morning', () => {
    // "read book 4-6" after a morning entry (e.g. woke up 7-8) should stay 04:00–06:00,
    // not get pushed to 16:00–18:00.
    const p = parseLine('read book 4-6', { lastEndMin: 480 });
    expect(p).toMatchObject({ startMin: 240, endMin: 360 });
  });

  it('explicit 24h times are never shifted: 14-15', () => {
    const p = parseLine('reading 14-15', { lastEndMin: 1080 });
    expect(p).toMatchObject({ startMin: 840, endMin: 900 });
  });

  it('"to" works as a range separator', () => {
    const p = parseLine('lunch 1pm to 2pm');
    expect(p).toMatchObject({ name: 'lunch', startMin: 780, endMin: 840 });
  });

  it('noon and midnight keywords', () => {
    const p = parseLine('emails noon-1pm');
    expect(p).toMatchObject({ startMin: 720, endMin: 780 });
    const q = parseLine('movie 10pm-midnight');
    expect(q).toMatchObject({ startMin: 1320, endMin: 1440 });
  });

  it('12am as an end means end-of-day (1440)', () => {
    const p = parseLine('reading 10pm-12am');
    expect(p).toMatchObject({ startMin: 1320, endMin: 1440, overnight: false });
  });

  it('nested range that cannot fit the parent throws OUT_OF_PARENT_BOUNDS', () => {
    expect(() => parseLine('> call 7-8', { parentRange: OFFICE })).toThrowError(ParseError);
    try { parseLine('> call 7-8', { parentRange: OFFICE }); } catch (e: any) {
      expect(e.code).toBe('OUT_OF_PARENT_BOUNDS');
    }
  });
});

describe('timeParser — errors', () => {
  it('missing time range → NO_TIME_RANGE', () => {
    try { parseLine('just vibes'); } catch (e: any) { expect(e.code).toBe('NO_TIME_RANGE'); }
    expect(() => parseLine('just vibes')).toThrow(ParseError);
  });

  it('missing name → EMPTY_NAME', () => {
    try { parseLine('9-6'); } catch (e: any) { expect(e.code).toBe('EMPTY_NAME'); }
    expect(() => parseLine('9-6')).toThrow(ParseError);
  });

  it('invalid time → INVALID_TIME', () => {
    try { parseLine('thing 25:00-26:00'); } catch (e: any) { expect(e.code).toBe('INVALID_TIME'); }
  });

  it('category tag with hyphen/underscore parses', () => {
    const p = parseLine('study 8-9 #deep_work');
    expect(p.categoryTag).toBe('deep_work');
  });
});

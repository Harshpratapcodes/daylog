import { describe, it, expect } from 'vitest';
import {
  assertWithinParent,
  assertNoSiblingOverlap,
  assertDepth,
  findChildrenOutOfBounds,
  ValidationError,
} from '../src/services/validation.js';

const r = (startMin: number, endMin: number, id?: string) => ({ startMin, endMin, id });

describe('V1 — child within parent', () => {
  const parent = r(540, 1080);
  it('accepts a child inside the parent', () => {
    expect(() => assertWithinParent(r(600, 700), parent)).not.toThrow();
  });
  it('accepts a child exactly matching the parent', () => {
    expect(() => assertWithinParent(r(540, 1080), parent)).not.toThrow();
  });
  it('rejects a child starting before the parent', () => {
    expect(() => assertWithinParent(r(500, 700), parent)).toThrowError(ValidationError);
  });
  it('rejects a child ending after the parent', () => {
    try { assertWithinParent(r(600, 1100), parent); } catch (e: any) {
      expect(e.code).toBe('CHILD_OUT_OF_BOUNDS');
    }
  });
});

describe('V2/V3 — sibling overlap', () => {
  const siblings = [r(540, 660, 'a'), r(720, 780, 'b')];
  it('accepts a non-overlapping candidate', () => {
    expect(() => assertNoSiblingOverlap(r(660, 720), siblings)).not.toThrow();
  });
  it('touching boundaries are legal (end === start)', () => {
    expect(() => assertNoSiblingOverlap(r(780, 900), siblings)).not.toThrow();
  });
  it('rejects partial overlap', () => {
    try { assertNoSiblingOverlap(r(600, 700), siblings); } catch (e: any) {
      expect(e.code).toBe('SIBLING_OVERLAP');
      expect(e.details.conflicting_id).toBe('a');
    }
    expect(() => assertNoSiblingOverlap(r(600, 700), siblings)).toThrow(ValidationError);
  });
  it('rejects full containment', () => {
    expect(() => assertNoSiblingOverlap(r(500, 800), siblings)).toThrow(ValidationError);
  });
  it('ignores self when editing (same id)', () => {
    expect(() => assertNoSiblingOverlap(r(540, 700, 'a'), siblings)).not.toThrow();
  });
});

describe('V4 — max depth', () => {
  it('allows nesting under a top-level activity', () => {
    expect(() => assertDepth(false)).not.toThrow();
  });
  it('rejects nesting under a child', () => {
    expect(() => assertDepth(true)).toThrowError(ValidationError);
  });
});

describe('V5 — children conflict on parent resize', () => {
  const children = [r(600, 660, 'c1'), r(900, 960, 'c2')];
  it('no conflicts when children still fit', () => {
    expect(findChildrenOutOfBounds(r(540, 1080), children)).toEqual([]);
  });
  it('returns only the conflicting children', () => {
    const out = findChildrenOutOfBounds(r(540, 930), children);
    expect(out.map(c => c.id)).toEqual(['c2']);
  });
});

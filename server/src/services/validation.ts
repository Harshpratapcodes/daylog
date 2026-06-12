/** Validation rules V1–V6 (Design Doc §3.4) as pure functions. */

export interface Range {
  id?: string;
  startMin: number;
  endMin: number;
}

export type ValidationCode =
  | 'CHILD_OUT_OF_BOUNDS'
  | 'SIBLING_OVERLAP'
  | 'MAX_DEPTH_EXCEEDED'
  | 'CHILDREN_CONFLICT';

export class ValidationError extends Error {
  constructor(public code: ValidationCode, message: string, public details: unknown = null) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** V1 — child must lie within parent. */
export function assertWithinParent(child: Range, parent: Range): void {
  if (child.startMin < parent.startMin || child.endMin > parent.endMin) {
    throw new ValidationError(
      'CHILD_OUT_OF_BOUNDS',
      'Sub-activity must fall inside its parent activity',
      { parent: { startMin: parent.startMin, endMin: parent.endMin } }
    );
  }
}

/** V2/V3 — no overlap among siblings. Touching boundaries (end === start) are legal. */
export function assertNoSiblingOverlap(candidate: Range, siblings: Range[]): void {
  const clash = siblings.find(
    s => s.id !== candidate.id && candidate.startMin < s.endMin && s.startMin < candidate.endMin
  );
  if (clash) {
    throw new ValidationError('SIBLING_OVERLAP', 'Overlaps an existing activity at the same level', {
      conflicting_id: clash.id ?? null,
      conflicting_range: { startMin: clash.startMin, endMin: clash.endMin },
    });
  }
}

/** V4 — max depth 2: a child may not itself be a parent. */
export function assertDepth(parentHasParent: boolean): void {
  if (parentHasParent) {
    throw new ValidationError('MAX_DEPTH_EXCEEDED', 'Nesting is limited to one level of sub-activities');
  }
}

/** V5 — resizing a parent must not orphan children. Returns conflicting children (empty = OK). */
export function findChildrenOutOfBounds(newRange: Range, children: Range[]): Range[] {
  return children.filter(c => c.startMin < newRange.startMin || c.endMin > newRange.endMin);
}

/** Assemble flat activity rows into the nested DayResponse tree + computed gaps (Design Doc §4.4). */

export interface ActivityRow {
  id: string;
  parent_id: string | null;
  name: string;
  start_min: number;
  end_min: number;
  duration_min: number;
  category_id: number;
  category_name: string;
  category_color: string;
}

export interface TreeNode {
  id: string;
  name: string;
  category: { id: number; name: string; color: string };
  start_min: number;
  end_min: number;
  duration_min: number;
  children: TreeNode[];
}

export function buildTree(rows: ActivityRow[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      name: r.name,
      category: { id: r.category_id, name: r.category_name, color: r.category_color },
      start_min: r.start_min,
      end_min: r.end_min,
      duration_min: r.duration_min,
      children: [],
    });
  }
  const roots: TreeNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    if (r.parent_id && nodes.has(r.parent_id)) nodes.get(r.parent_id)!.children.push(node);
    else roots.push(node);
  }
  const byStart = (a: TreeNode, b: TreeNode) => a.start_min - b.start_min;
  roots.sort(byStart);
  for (const root of roots) root.children.sort(byStart);
  return roots;
}

export function computeGaps(roots: TreeNode[]): { gaps: { start_min: number; end_min: number }[]; total_logged_min: number; unaccounted_min: number } {
  const gaps: { start_min: number; end_min: number }[] = [];
  let cursor = 0;
  let logged = 0;
  for (const r of roots) {
    if (r.start_min > cursor) gaps.push({ start_min: cursor, end_min: r.start_min });
    logged += r.end_min - r.start_min;
    cursor = Math.max(cursor, r.end_min);
  }
  if (cursor < 1440) gaps.push({ start_min: cursor, end_min: 1440 });
  return { gaps, total_logged_min: logged, unaccounted_min: 1440 - logged };
}

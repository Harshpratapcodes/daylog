// Shared types between Daylog client and server (Design Doc §3, §4)

export interface Category {
  id: number;
  name: string;
  color: string;
  is_system: boolean;
  /** Deleted-but-referenced: hidden from logging UIs, still shown on past days. */
  archived: boolean;
}

export interface ActivityNode {
  id: string;
  name: string;
  category: Pick<Category, 'id' | 'name' | 'color'>;
  start_min: number;
  end_min: number;
  duration_min: number;
  children: ActivityNode[];
}

export interface Gap {
  start_min: number;
  end_min: number;
}

export interface DayResponse {
  id: string;
  log_date: string;
  status: 'draft' | 'finalized';
  reflection_note: string | null;
  activities: ActivityNode[];
  computed: {
    total_logged_min: number;
    unaccounted_min: number;
    gaps: Gap[];
  };
}

export type ValidationCode =
  | 'CHILD_OUT_OF_BOUNDS'
  | 'SIBLING_OVERLAP'
  | 'MAX_DEPTH_EXCEEDED'
  | 'CHILDREN_CONFLICT'
  | 'CATEGORY_FORBIDDEN';

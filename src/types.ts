/**
 * A single spec as represented in cecli's todos.json
 */
export interface CecliTodo {
  id: string;
  title: string;
  spec: string;
  requirements: string;
  design: string;
  tasks_md: string;
  depends_on: string[];
  branch: string;
  pr_url: string;
  status: string;
  links: string[];
  checklist: CecliChecklistItem[];
  created_at: string;
  updated_at: string;
}

export interface CecliChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface CecliTodosFile {
  version: number;
  activeId: string;
  todos: CecliTodo[];
}

/**
 * Represents a spec on the Kiro side (filesystem-based)
 */
export interface KiroSpec {
  name: string; // folder name under .kiro/specs/
  requirements: string;
  design: string;
  tasks: string;
  /** mtime of the newest of the 3 files */
  lastModified: Date;
}

/**
 * Represents a spec on the cecli side (from todos.json + .cecli/specs/{hash}/)
 */
export interface CecliSpec {
  id: string; // hash
  title: string;
  requirements: string;
  design: string;
  tasks: string;
  /** mtime from the filesystem spec files or updated_at from todos.json */
  lastModified: Date;
}

export type SyncDirection = 'kiro-newer' | 'cecli-newer' | 'conflict' | 'kiro-only' | 'cecli-only' | 'in-sync';

export interface SyncPair {
  kiroName: string | null;
  cecliId: string | null;
  cecliTitle: string | null;
  direction: SyncDirection;
  kiroSpec: KiroSpec | null;
  cecliSpec: CecliSpec | null;
}

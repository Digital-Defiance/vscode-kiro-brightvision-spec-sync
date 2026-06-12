import { KiroSpec, CecliSpec, SyncPair, SyncDirection } from './types';
import { titleToKiroName, kiroNameMatchesTitle } from './naming';
import { readKiroSpecs, writeKiroSpec } from './kiroReader';
import { readCecliSpecs, writeCecliSpec, createCecliSpec } from './cecliReader';

/**
 * Content-based equality check. Normalizes whitespace for comparison.
 */
function contentEqual(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

/**
 * Determine sync direction for a matched pair.
 */
function determineSyncDirection(kiro: KiroSpec, cecli: CecliSpec): SyncDirection {
  const reqSame = contentEqual(kiro.requirements, cecli.requirements);
  const designSame = contentEqual(kiro.design, cecli.design);
  const tasksSame = contentEqual(kiro.tasks, cecli.tasks);

  if (reqSame && designSame && tasksSame) {
    return 'in-sync';
  }

  // Both have changes relative to each other — use timestamps to break tie
  const kiroTime = kiro.lastModified.getTime();
  const cecliTime = cecli.lastModified.getTime();

  // If timestamps are within 2 seconds, treat as conflict
  if (Math.abs(kiroTime - cecliTime) < 2000) {
    return 'conflict';
  }

  return kiroTime > cecliTime ? 'kiro-newer' : 'cecli-newer';
}

/**
 * Build the list of sync pairs by matching Kiro specs to cecli specs.
 */
export function buildSyncPairs(workspaceRoot: string): SyncPair[] {
  const kiroSpecs = readKiroSpecs(workspaceRoot);
  const cecliSpecs = readCecliSpecs(workspaceRoot);

  const pairs: SyncPair[] = [];
  const matchedCecliIds = new Set<string>();
  const matchedKiroNames = new Set<string>();

  // Match by title → kiro name
  for (const cecli of cecliSpecs) {
    const expectedKiroName = titleToKiroName(cecli.title);
    const matchedKiro = kiroSpecs.find(k => k.name === expectedKiroName);

    if (matchedKiro) {
      matchedCecliIds.add(cecli.id);
      matchedKiroNames.add(matchedKiro.name);

      const direction = determineSyncDirection(matchedKiro, cecli);
      pairs.push({
        kiroName: matchedKiro.name,
        cecliId: cecli.id,
        cecliTitle: cecli.title,
        direction,
        kiroSpec: matchedKiro,
        cecliSpec: cecli,
      });
    }
  }

  // Also try fuzzy matching for kiro specs that didn't match by exact slug
  for (const kiro of kiroSpecs) {
    if (matchedKiroNames.has(kiro.name)) {
      continue;
    }

    // Try to find a cecli spec whose title fuzzy-matches
    const matchedCecli = cecliSpecs.find(c =>
      !matchedCecliIds.has(c.id) && kiroNameMatchesTitle(kiro.name, c.title)
    );

    if (matchedCecli) {
      matchedCecliIds.add(matchedCecli.id);
      matchedKiroNames.add(kiro.name);

      const direction = determineSyncDirection(kiro, matchedCecli);
      pairs.push({
        kiroName: kiro.name,
        cecliId: matchedCecli.id,
        cecliTitle: matchedCecli.title,
        direction,
        kiroSpec: kiro,
        cecliSpec: matchedCecli,
      });
    }
  }

  // Kiro-only specs (no cecli match)
  for (const kiro of kiroSpecs) {
    if (!matchedKiroNames.has(kiro.name)) {
      pairs.push({
        kiroName: kiro.name,
        cecliId: null,
        cecliTitle: null,
        direction: 'kiro-only',
        kiroSpec: kiro,
        cecliSpec: null,
      });
    }
  }

  // cecli-only specs (no kiro match)
  for (const cecli of cecliSpecs) {
    if (!matchedCecliIds.has(cecli.id)) {
      pairs.push({
        kiroName: null,
        cecliId: cecli.id,
        cecliTitle: cecli.title,
        direction: 'cecli-only',
        kiroSpec: null,
        cecliSpec: cecli,
      });
    }
  }

  return pairs;
}

export interface SyncResult {
  synced: number;
  skipped: number;
  conflicts: number;
  details: string[];
}

/**
 * Execute bidirectional sync: newer side wins, conflicts are skipped.
 */
export function syncAll(workspaceRoot: string): SyncResult {
  const pairs = buildSyncPairs(workspaceRoot);
  const result: SyncResult = { synced: 0, skipped: 0, conflicts: 0, details: [] };

  for (const pair of pairs) {
    switch (pair.direction) {
      case 'in-sync':
        result.skipped++;
        result.details.push(`✓ ${pair.kiroName ?? pair.cecliTitle} — already in sync`);
        break;

      case 'kiro-newer':
        syncKiroToCecli(workspaceRoot, pair);
        result.synced++;
        result.details.push(`→ ${pair.kiroName} — pushed to cecli (kiro newer)`);
        break;

      case 'cecli-newer':
        syncCecliToKiro(workspaceRoot, pair);
        result.synced++;
        result.details.push(`← ${pair.cecliTitle} — pulled to kiro (cecli newer)`);
        break;

      case 'kiro-only':
        pushKiroToCecli(workspaceRoot, pair);
        result.synced++;
        result.details.push(`→ ${pair.kiroName} — created in cecli`);
        break;

      case 'cecli-only':
        pullCecliToKiro(workspaceRoot, pair);
        result.synced++;
        result.details.push(`← ${pair.cecliTitle} — created in kiro`);
        break;

      case 'conflict':
        result.conflicts++;
        result.details.push(`⚠ ${pair.kiroName ?? pair.cecliTitle} — CONFLICT (timestamps too close, skipped)`);
        break;
    }
  }

  return result;
}

/**
 * Pull all cecli specs to Kiro (cecli → kiro direction only).
 */
export function syncAllToKiro(workspaceRoot: string): SyncResult {
  const pairs = buildSyncPairs(workspaceRoot);
  const result: SyncResult = { synced: 0, skipped: 0, conflicts: 0, details: [] };

  for (const pair of pairs) {
    if (pair.direction === 'cecli-newer' || pair.direction === 'cecli-only') {
      if (pair.direction === 'cecli-only') {
        pullCecliToKiro(workspaceRoot, pair);
      } else {
        syncCecliToKiro(workspaceRoot, pair);
      }
      result.synced++;
      result.details.push(`← ${pair.cecliTitle} — pulled to kiro`);
    } else if (pair.direction === 'in-sync') {
      result.skipped++;
    } else if (pair.direction === 'conflict') {
      result.conflicts++;
      result.details.push(`⚠ ${pair.cecliTitle} — conflict, skipped`);
    } else {
      result.skipped++;
    }
  }

  return result;
}

/**
 * Push all Kiro specs to cecli (kiro → cecli direction only).
 */
export function syncAllToCecli(workspaceRoot: string): SyncResult {
  const pairs = buildSyncPairs(workspaceRoot);
  const result: SyncResult = { synced: 0, skipped: 0, conflicts: 0, details: [] };

  for (const pair of pairs) {
    if (pair.direction === 'kiro-newer' || pair.direction === 'kiro-only') {
      if (pair.direction === 'kiro-only') {
        pushKiroToCecli(workspaceRoot, pair);
      } else {
        syncKiroToCecli(workspaceRoot, pair);
      }
      result.synced++;
      result.details.push(`→ ${pair.kiroName} — pushed to cecli`);
    } else if (pair.direction === 'in-sync') {
      result.skipped++;
    } else if (pair.direction === 'conflict') {
      result.conflicts++;
      result.details.push(`⚠ ${pair.kiroName} — conflict, skipped`);
    } else {
      result.skipped++;
    }
  }

  return result;
}

/**
 * Sync a single pair. Optionally force a direction.
 */
export function syncSinglePair(workspaceRoot: string, pair: SyncPair, forceDirection?: 'push' | 'pull'): void {
  if (forceDirection === 'push') {
    if (pair.kiroSpec && pair.cecliId) {
      syncKiroToCecli(workspaceRoot, pair);
    } else if (pair.kiroSpec && !pair.cecliId) {
      pushKiroToCecli(workspaceRoot, pair);
    }
    return;
  }

  if (forceDirection === 'pull') {
    if (pair.cecliSpec && pair.kiroName) {
      syncCecliToKiro(workspaceRoot, pair);
    } else if (pair.cecliSpec && !pair.kiroName) {
      pullCecliToKiro(workspaceRoot, pair);
    }
    return;
  }

  // Auto-direction based on analysis
  switch (pair.direction) {
    case 'kiro-newer':
    case 'kiro-only':
      if (pair.cecliId) {
        syncKiroToCecli(workspaceRoot, pair);
      } else {
        pushKiroToCecli(workspaceRoot, pair);
      }
      break;
    case 'cecli-newer':
    case 'cecli-only':
      if (pair.kiroName) {
        syncCecliToKiro(workspaceRoot, pair);
      } else {
        pullCecliToKiro(workspaceRoot, pair);
      }
      break;
    case 'conflict':
      throw new Error('Cannot auto-sync a conflict. Choose push or pull explicitly.');
    case 'in-sync':
      // Nothing to do
      break;
  }
}

// --- Internal sync operations ---

function syncKiroToCecli(workspaceRoot: string, pair: SyncPair): void {
  if (!pair.kiroSpec || !pair.cecliId) { return; }
  writeCecliSpec(workspaceRoot, pair.cecliId, pair.kiroSpec.requirements, pair.kiroSpec.design, pair.kiroSpec.tasks);
}

function syncCecliToKiro(workspaceRoot: string, pair: SyncPair): void {
  if (!pair.cecliSpec || !pair.kiroName) { return; }
  writeKiroSpec(workspaceRoot, pair.kiroName, pair.cecliSpec.requirements, pair.cecliSpec.design, pair.cecliSpec.tasks);
}

function pushKiroToCecli(workspaceRoot: string, pair: SyncPair): void {
  if (!pair.kiroSpec || !pair.kiroName) { return; }
  // Convert kiro folder name to a title for cecli
  const title = kiroNameToTitle(pair.kiroName);
  createCecliSpec(workspaceRoot, title, pair.kiroSpec.requirements, pair.kiroSpec.design, pair.kiroSpec.tasks);
}

function pullCecliToKiro(workspaceRoot: string, pair: SyncPair): void {
  if (!pair.cecliSpec) { return; }
  const kiroName = titleToKiroName(pair.cecliSpec.title);
  writeKiroSpec(workspaceRoot, kiroName, pair.cecliSpec.requirements, pair.cecliSpec.design, pair.cecliSpec.tasks);
}

/**
 * Convert a kiro folder name back to a human-readable title.
 * "multiple-llm-managers" → "Multiple Llm Managers"
 */
function kiroNameToTitle(name: string): string {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

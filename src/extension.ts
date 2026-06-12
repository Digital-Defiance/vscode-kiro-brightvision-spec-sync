import * as vscode from 'vscode';
import * as path from 'path';
import { buildSyncPairs, syncAll, syncAllToKiro, syncAllToCecli, syncSinglePair } from './syncEngine';
import { SpecTreeProvider, SpecTreeItem } from './specTreeProvider';
import { titleToKiroName } from './naming';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Kiro ↔ BrightVision Sync');

  // Tree view
  const treeProvider = new SpecTreeProvider();
  const treeView = vscode.window.createTreeView('kiroBvSpecs', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  // Commands
  context.subscriptions.push(
    treeView,
    vscode.commands.registerCommand('kiroBvSync.syncAll', () => runSync('all', outputChannel, treeProvider)),
    vscode.commands.registerCommand('kiroBvSync.syncToKiro', () => runSync('toKiro', outputChannel, treeProvider)),
    vscode.commands.registerCommand('kiroBvSync.syncToCecli', () => runSync('toCecli', outputChannel, treeProvider)),
    vscode.commands.registerCommand('kiroBvSync.showStatus', () => showStatus(outputChannel)),
    vscode.commands.registerCommand('kiroBvSync.refresh', () => treeProvider.refresh()),
    vscode.commands.registerCommand('kiroBvSync.syncSpec', (item: SpecTreeItem) => syncSingle(item, outputChannel, treeProvider)),
    vscode.commands.registerCommand('kiroBvSync.pushSpec', (item: SpecTreeItem) => syncSingle(item, outputChannel, treeProvider, 'push')),
    vscode.commands.registerCommand('kiroBvSync.pullSpec', (item: SpecTreeItem) => syncSingle(item, outputChannel, treeProvider, 'pull')),
    vscode.commands.registerCommand('kiroBvSync.openKiroSpec', (item: SpecTreeItem) => openKiroSpec(item)),
    vscode.commands.registerCommand('kiroBvSync.openCecliSpec', (item: SpecTreeItem) => openCecliSpec(item)),
  );

  // File watchers for auto-refresh
  const kiroWatcher = vscode.workspace.createFileSystemWatcher('**/.kiro/specs/**/*.md');
  const cecliWatcher = vscode.workspace.createFileSystemWatcher('**/.cecli/specs/**/*.md');
  const todosWatcher = vscode.workspace.createFileSystemWatcher('**/.cecli/todos.json');

  const debouncedRefresh = debounce(() => treeProvider.refresh(), 2000);

  kiroWatcher.onDidChange(debouncedRefresh);
  kiroWatcher.onDidCreate(debouncedRefresh);
  cecliWatcher.onDidChange(debouncedRefresh);
  cecliWatcher.onDidCreate(debouncedRefresh);
  todosWatcher.onDidChange(debouncedRefresh);

  context.subscriptions.push(kiroWatcher, cecliWatcher, todosWatcher);

  outputChannel.appendLine('Kiro ↔ BrightVision Spec Sync activated');
}

export function deactivate() {}

// --- Command handlers ---

async function runSync(
  mode: 'all' | 'toKiro' | 'toCecli',
  outputChannel: vscode.OutputChannel,
  treeProvider: SpecTreeProvider
) {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  outputChannel.clear();
  outputChannel.show(true);

  try {
    let result;
    switch (mode) {
      case 'all':
        result = syncAll(workspaceRoot);
        break;
      case 'toKiro':
        result = syncAllToKiro(workspaceRoot);
        break;
      case 'toCecli':
        result = syncAllToCecli(workspaceRoot);
        break;
    }

    outputChannel.appendLine(`=== Sync Complete (${mode}) ===`);
    outputChannel.appendLine(`Synced: ${result.synced} | Skipped: ${result.skipped} | Conflicts: ${result.conflicts}`);
    outputChannel.appendLine('');
    for (const detail of result.details) {
      outputChannel.appendLine(detail);
    }

    treeProvider.refresh();

    if (result.conflicts > 0) {
      vscode.window.showWarningMessage(
        `Sync complete: ${result.synced} synced, ${result.conflicts} conflict(s) need manual resolution.`
      );
    } else {
      vscode.window.showInformationMessage(
        `Sync complete: ${result.synced} spec(s) synced.`
      );
    }
  } catch (err: any) {
    outputChannel.appendLine(`ERROR: ${err.message}`);
    vscode.window.showErrorMessage(`Sync failed: ${err.message}`);
  }
}

async function syncSingle(
  item: SpecTreeItem,
  outputChannel: vscode.OutputChannel,
  treeProvider: SpecTreeProvider,
  forceDirection?: 'push' | 'pull'
) {
  if (!item.pair) { return; }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) { return; }

  try {
    const name = item.pair.kiroName ?? item.pair.cecliTitle ?? 'unknown';
    syncSinglePair(workspaceRoot, item.pair, forceDirection);
    treeProvider.refresh();
    vscode.window.showInformationMessage(`Synced: ${name}`);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Sync failed for ${item.label}: ${err.message}`);
  }
}

async function openKiroSpec(item: SpecTreeItem) {
  if (!item.pair?.kiroName) { return; }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) { return; }

  const reqPath = path.join(workspaceRoot, '.kiro', 'specs', item.pair.kiroName, 'requirements.md');
  const uri = vscode.Uri.file(reqPath);
  await vscode.window.showTextDocument(uri, { preview: false });
}

async function openCecliSpec(item: SpecTreeItem) {
  if (!item.pair?.cecliId) { return; }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) { return; }

  const reqPath = path.join(workspaceRoot, '.cecli', 'specs', item.pair.cecliId, 'requirements.md');
  const uri = vscode.Uri.file(reqPath);
  await vscode.window.showTextDocument(uri, { preview: false });
}

async function showStatus(outputChannel: vscode.OutputChannel) {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  outputChannel.clear();
  outputChannel.show(true);

  try {
    const pairs = buildSyncPairs(workspaceRoot);

    outputChannel.appendLine('=== Kiro ↔ BrightVision Sync Status ===');
    outputChannel.appendLine('');

    if (pairs.length === 0) {
      outputChannel.appendLine('No specs found in either .kiro or .cecli');
      return;
    }

    for (const pair of pairs) {
      const name = pair.kiroName ?? pair.cecliTitle ?? 'unknown';
      const icon = getDirectionIcon(pair.direction);
      const cecliInfo = pair.cecliId ? ` [bv: ${pair.cecliId.slice(0, 8)}…]` : '';
      outputChannel.appendLine(`${icon} ${name}${cecliInfo} — ${pair.direction}`);
    }

    outputChannel.appendLine('');
    outputChannel.appendLine(`Total: ${pairs.length} spec(s)`);
  } catch (err: any) {
    outputChannel.appendLine(`ERROR: ${err.message}`);
    vscode.window.showErrorMessage(`Status check failed: ${err.message}`);
  }
}

// --- Helpers ---

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getDirectionIcon(direction: string): string {
  switch (direction) {
    case 'in-sync': return '✓';
    case 'kiro-newer': return '→';
    case 'cecli-newer': return '←';
    case 'kiro-only': return '⊕';
    case 'cecli-only': return '⊖';
    case 'conflict': return '⚠';
    default: return '?';
  }
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) { clearTimeout(timer); }
    timer = setTimeout(fn, ms);
  };
}

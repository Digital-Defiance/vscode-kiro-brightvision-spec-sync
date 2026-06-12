import * as vscode from 'vscode';
import * as path from 'path';
import { SyncPair, SyncDirection } from './types';
import { buildSyncPairs } from './syncEngine';

export class SpecTreeProvider implements vscode.TreeDataProvider<SpecTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SpecTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private workspaceRoot: string | undefined;

  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  refresh(): void {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SpecTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SpecTreeItem): SpecTreeItem[] {
    if (!this.workspaceRoot) {
      return [new SpecTreeItem('No workspace open', '', 'none', null)];
    }

    if (element) {
      // Child items: show file details
      return this.getSpecFiles(element.pair);
    }

    // Root: list all sync pairs
    try {
      const pairs = buildSyncPairs(this.workspaceRoot);

      if (pairs.length === 0) {
        return [new SpecTreeItem('No specs found', '', 'none', null)];
      }

      // Sort: conflicts/out-of-sync first, then in-sync
      const sortOrder: Record<SyncDirection, number> = {
        'conflict': 0,
        'kiro-newer': 1,
        'cecli-newer': 2,
        'kiro-only': 3,
        'cecli-only': 4,
        'in-sync': 5,
      };

      pairs.sort((a, b) => sortOrder[a.direction] - sortOrder[b.direction]);

      return pairs.map(pair => {
        const name = pair.kiroName ?? pair.cecliTitle ?? 'unknown';
        return new SpecTreeItem(name, pair.direction, pair.direction, pair);
      });
    } catch (err: any) {
      return [new SpecTreeItem(`Error: ${err.message}`, '', 'none', null)];
    }
  }

  private getSpecFiles(pair: SyncPair | null): SpecTreeItem[] {
    if (!pair) { return []; }

    const items: SpecTreeItem[] = [];

    if (pair.kiroSpec) {
      const kiroMtime = pair.kiroSpec.lastModified.toLocaleString();
      items.push(new SpecTreeItem(`Kiro: ${pair.kiroName}`, `modified ${kiroMtime}`, 'info', null));
    }

    if (pair.cecliSpec) {
      const cecliMtime = pair.cecliSpec.lastModified.toLocaleString();
      items.push(new SpecTreeItem(`BrightVision: ${pair.cecliSpec.id.slice(0, 8)}…`, `modified ${cecliMtime}`, 'info', null));
    }

    return items;
  }
}

export class SpecTreeItem extends vscode.TreeItem {
  public pair: SyncPair | null;

  constructor(
    public readonly label: string,
    private detail: string,
    private direction: string,
    pair: SyncPair | null,
  ) {
    super(
      label,
      pair ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );

    this.pair = pair;
    this.description = this.getDescription();
    this.tooltip = this.getTooltip();
    this.iconPath = this.getIcon();
    this.contextValue = this.getContextValue();
  }

  private getDescription(): string {
    switch (this.direction) {
      case 'in-sync': return '✓ in sync';
      case 'kiro-newer': return '→ kiro newer';
      case 'cecli-newer': return '← BV newer';
      case 'kiro-only': return '⊕ kiro only';
      case 'cecli-only': return '⊖ BV only';
      case 'conflict': return '⚠ conflict';
      case 'info': return this.detail;
      default: return '';
    }
  }

  private getTooltip(): string {
    if (!this.pair) { return this.label; }

    const lines = [this.label];
    if (this.pair.kiroName) { lines.push(`Kiro: .kiro/specs/${this.pair.kiroName}/`); }
    if (this.pair.cecliId) { lines.push(`BrightVision: .cecli/specs/${this.pair.cecliId}/`); }
    lines.push(`Status: ${this.direction}`);
    return lines.join('\n');
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.direction) {
      case 'in-sync': return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
      case 'kiro-newer': return new vscode.ThemeIcon('arrow-right', new vscode.ThemeColor('charts.blue'));
      case 'cecli-newer': return new vscode.ThemeIcon('arrow-left', new vscode.ThemeColor('charts.orange'));
      case 'kiro-only': return new vscode.ThemeIcon('add', new vscode.ThemeColor('charts.blue'));
      case 'cecli-only': return new vscode.ThemeIcon('add', new vscode.ThemeColor('charts.orange'));
      case 'conflict': return new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconFailed'));
      case 'info': return new vscode.ThemeIcon('file');
      default: return new vscode.ThemeIcon('circle-outline');
    }
  }

  private getContextValue(): string {
    if (!this.pair) { return 'none'; }

    const parts: string[] = [this.direction];

    // Mark as syncable for inline sync button
    if (this.direction !== 'in-sync' && this.direction !== 'conflict') {
      parts.push('syncable');
    }

    // Mark which sides exist for open commands
    if (this.pair.kiroSpec) { parts.push('has-kiro'); }
    if (this.pair.cecliSpec) { parts.push('has-cecli'); }

    return parts.join(',');
  }
}

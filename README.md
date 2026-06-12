# Kiro ↔ cecli Spec Sync

A VS Code extension for bidirectional synchronization of EARS specs between Kiro (`.kiro/specs/{name}/`) and cecli (`.cecli/specs/{hash}/` + `todos.json`).

## How It Works

| Kiro | cecli |
|------|-------|
| `.kiro/specs/multiple-llm-managers/requirements.md` | `.cecli/specs/fa501fd9.../requirements.md` |
| `.kiro/specs/multiple-llm-managers/design.md` | `.cecli/specs/fa501fd9.../design.md` |
| `.kiro/specs/multiple-llm-managers/tasks.md` | `.cecli/specs/fa501fd9.../tasks.md` |

The mapping between systems is done via the **title** field in cecli's `todos.json` — it gets slugified to match Kiro's folder names (e.g., "Multiple LLM Manager Support" → `multiple-llm-manager-support`).

## Sync Logic

1. **Match specs** by converting cecli titles to kebab-case and comparing against Kiro folder names
2. **Compare content** — if all three files match (ignoring trailing whitespace), they're in sync
3. **Determine direction** — when content differs, the system with the newer filesystem `mtime` wins
4. **Handle edge cases**:
   - Specs only in Kiro → creates them in cecli (new entry in `todos.json` + filesystem)
   - Specs only in cecli → creates them in Kiro
   - Timestamps within 2 seconds → flagged as conflict, skipped

## Commands

- **Kiro ↔ cecli: Sync All Specs** — bidirectional sync, newer side wins
- **Kiro ↔ cecli: Pull from cecli → Kiro** — one-way, cecli → kiro only
- **Kiro ↔ cecli: Push from Kiro → cecli** — one-way, kiro → cecli only
- **Kiro ↔ cecli: Show Sync Status** — display which specs are out of sync

## Auto-Detection

The extension watches for changes to:
- `.kiro/specs/**/*.md`
- `.cecli/specs/**/*.md`
- `.cecli/todos.json`

When changes are detected, a notification offers to sync or show status.

## Development

```bash
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

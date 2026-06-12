import * as fs from 'fs';
import * as path from 'path';
import { KiroSpec } from './types';

/**
 * Read all specs from the .kiro/specs/ directory.
 */
export function readKiroSpecs(workspaceRoot: string): KiroSpec[] {
  const specsDir = path.join(workspaceRoot, '.kiro', 'specs');

  if (!fs.existsSync(specsDir)) {
    return [];
  }

  const entries = fs.readdirSync(specsDir, { withFileTypes: true });
  const specs: KiroSpec[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const specDir = path.join(specsDir, entry.name);
    const spec = readSingleKiroSpec(entry.name, specDir);
    if (spec) {
      specs.push(spec);
    }
  }

  return specs;
}

function readSingleKiroSpec(name: string, specDir: string): KiroSpec | null {
  const reqPath = path.join(specDir, 'requirements.md');
  const designPath = path.join(specDir, 'design.md');
  const tasksPath = path.join(specDir, 'tasks.md');

  // At least one file must exist
  const exists = [reqPath, designPath, tasksPath].some(p => fs.existsSync(p));
  if (!exists) {
    return null;
  }

  const requirements = safeReadFile(reqPath);
  const design = safeReadFile(designPath);
  const tasks = safeReadFile(tasksPath);

  // Get the most recent mtime across all files
  const mtimes = [reqPath, designPath, tasksPath]
    .filter(p => fs.existsSync(p))
    .map(p => fs.statSync(p).mtime);

  const lastModified = mtimes.length > 0
    ? new Date(Math.max(...mtimes.map(d => d.getTime())))
    : new Date(0);

  return { name, requirements, design, tasks, lastModified };
}

function safeReadFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Write a spec to .kiro/specs/{name}/
 */
export function writeKiroSpec(workspaceRoot: string, name: string, requirements: string, design: string, tasks: string): void {
  const specDir = path.join(workspaceRoot, '.kiro', 'specs', name);
  fs.mkdirSync(specDir, { recursive: true });

  fs.writeFileSync(path.join(specDir, 'requirements.md'), requirements, 'utf-8');
  fs.writeFileSync(path.join(specDir, 'design.md'), design, 'utf-8');
  fs.writeFileSync(path.join(specDir, 'tasks.md'), tasks, 'utf-8');
}

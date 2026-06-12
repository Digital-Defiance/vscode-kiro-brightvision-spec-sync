import * as fs from 'fs';
import * as path from 'path';
import { CecliSpec, CecliTodosFile } from './types';

/**
 * Read all specs from the .cecli system.
 *
 * cecli stores spec metadata in .cecli/todos.json and the actual
 * spec files in .cecli/specs/{hash}/{requirements|design|tasks}.md
 *
 * The todos.json also contains inline requirements/design/tasks_md fields,
 * but the filesystem versions in .cecli/specs/{hash}/ are the canonical source
 * when they exist (they may be more recently written by the agent).
 */
export function readCecliSpecs(workspaceRoot: string): CecliSpec[] {
  const todosPath = path.join(workspaceRoot, '.cecli', 'todos.json');

  if (!fs.existsSync(todosPath)) {
    return [];
  }

  let todosFile: CecliTodosFile;
  try {
    const raw = fs.readFileSync(todosPath, 'utf-8');
    todosFile = JSON.parse(raw);
  } catch {
    return [];
  }

  const specs: CecliSpec[] = [];

  for (const todo of todosFile.todos) {
    const spec = readSingleCecliSpec(workspaceRoot, todo.id, todo.title, todo.requirements, todo.design, todo.tasks_md, todo.updated_at);
    if (spec) {
      specs.push(spec);
    }
  }

  return specs;
}

function readSingleCecliSpec(
  workspaceRoot: string,
  id: string,
  title: string,
  inlineRequirements: string,
  inlineDesign: string,
  inlineTasksMd: string,
  updatedAt: string
): CecliSpec | null {
  const specDir = path.join(workspaceRoot, '.cecli', 'specs', id);

  // Try filesystem first, fall back to inline content from todos.json
  let requirements: string;
  let design: string;
  let tasks: string;
  let lastModified: Date;

  if (fs.existsSync(specDir)) {
    const reqPath = path.join(specDir, 'requirements.md');
    const designPath = path.join(specDir, 'design.md');
    const tasksPath = path.join(specDir, 'tasks.md');

    requirements = safeReadFile(reqPath) || inlineRequirements;
    design = safeReadFile(designPath) || inlineDesign;
    tasks = safeReadFile(tasksPath) || inlineTasksMd;

    // Use filesystem mtime if spec files exist
    const mtimes = [reqPath, designPath, tasksPath]
      .filter(p => fs.existsSync(p))
      .map(p => fs.statSync(p).mtime);

    if (mtimes.length > 0) {
      lastModified = new Date(Math.max(...mtimes.map(d => d.getTime())));
    } else {
      lastModified = new Date(updatedAt);
    }
  } else {
    // Fall back entirely to inline content
    requirements = inlineRequirements;
    design = inlineDesign;
    tasks = inlineTasksMd;
    lastModified = new Date(updatedAt);
  }

  // Skip specs with no meaningful content
  if (!requirements && !design && !tasks) {
    return null;
  }

  return { id, title, requirements, design, tasks, lastModified };
}

function safeReadFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Write a spec to .cecli/specs/{id}/ and update the inline fields in todos.json
 */
export function writeCecliSpec(
  workspaceRoot: string,
  id: string,
  requirements: string,
  design: string,
  tasks: string
): void {
  // Write filesystem copies
  const specDir = path.join(workspaceRoot, '.cecli', 'specs', id);
  fs.mkdirSync(specDir, { recursive: true });

  fs.writeFileSync(path.join(specDir, 'requirements.md'), requirements, 'utf-8');
  fs.writeFileSync(path.join(specDir, 'design.md'), design, 'utf-8');
  fs.writeFileSync(path.join(specDir, 'tasks.md'), tasks, 'utf-8');

  // Also update todos.json inline fields
  const todosPath = path.join(workspaceRoot, '.cecli', 'todos.json');
  if (fs.existsSync(todosPath)) {
    try {
      const raw = fs.readFileSync(todosPath, 'utf-8');
      const todosFile: CecliTodosFile = JSON.parse(raw);

      const todo = todosFile.todos.find(t => t.id === id);
      if (todo) {
        todo.requirements = requirements;
        todo.design = design;
        todo.tasks_md = tasks;
        todo.updated_at = new Date().toISOString();
      }

      fs.writeFileSync(todosPath, JSON.stringify(todosFile, null, 2), 'utf-8');
    } catch {
      // If we can't update todos.json, the filesystem files are still written
    }
  }
}

/**
 * Create a new cecli spec entry (for Kiro-only specs that need to be pushed to cecli).
 * Generates a hash-style ID and adds it to todos.json.
 */
export function createCecliSpec(
  workspaceRoot: string,
  title: string,
  requirements: string,
  design: string,
  tasks: string
): string {
  const id = generateCecliId();

  // Write filesystem files
  writeCecliSpec(workspaceRoot, id, requirements, design, tasks);

  // Add entry to todos.json
  const todosPath = path.join(workspaceRoot, '.cecli', 'todos.json');
  let todosFile: CecliTodosFile;

  if (fs.existsSync(todosPath)) {
    try {
      const raw = fs.readFileSync(todosPath, 'utf-8');
      todosFile = JSON.parse(raw);
    } catch {
      todosFile = { version: 1, activeId: '', todos: [] };
    }
  } else {
    fs.mkdirSync(path.dirname(todosPath), { recursive: true });
    todosFile = { version: 1, activeId: '', todos: [] };
  }

  todosFile.todos.push({
    id,
    title,
    spec: '',
    requirements,
    design,
    tasks_md: tasks,
    depends_on: [],
    branch: '',
    pr_url: '',
    status: 'pending',
    links: [],
    checklist: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  fs.writeFileSync(todosPath, JSON.stringify(todosFile, null, 2), 'utf-8');

  return id;
}

function generateCecliId(): string {
  // Generate a 32-char hex string similar to cecli's hash IDs
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

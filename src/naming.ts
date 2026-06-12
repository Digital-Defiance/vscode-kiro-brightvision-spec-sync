/**
 * Utilities for converting between cecli todo titles and Kiro spec folder names.
 *
 * Kiro uses kebab-case folder names: "Multiple LLM Manager Support" → "multiple-llm-manager-support"
 * cecli uses hash-based folders but stores the title in todos.json.
 */

/**
 * Convert a cecli todo title to a Kiro-style spec folder name (kebab-case slug).
 */
export function titleToKiroName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // strip non-alphanumeric except spaces/hyphens
    .replace(/\s+/g, '-')          // spaces → hyphens
    .replace(/-+/g, '-')           // collapse multiple hyphens
    .replace(/^-|-$/g, '');        // trim leading/trailing hyphens
}

/**
 * Attempt to match a Kiro spec folder name back to a cecli title.
 * Uses slug comparison since the transformation is lossy.
 */
export function kiroNameMatchesTitle(kiroName: string, title: string): boolean {
  return titleToKiroName(title) === kiroName;
}

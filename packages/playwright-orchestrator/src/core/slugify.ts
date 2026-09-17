/**
 * Slugify a string for use in cache keys
 *
 * Converts to lowercase, replaces spaces and special characters with hyphens,
 * and removes consecutive hyphens.
 *
 * @example
 * slugify("Mobile Chrome") // "mobile-chrome"
 * slugify("feature/ABC-123") // "feature-abc-123"
 * slugify("refs/heads/main") // "refs-heads-main"
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .replace(/-+/g, '-'); // Remove consecutive hyphens
}

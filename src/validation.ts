/** Validate untrusted JSON before it enters typed application code. */
export function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
  return value as Record<string, unknown>;
}
export function stringValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error('Expected a text value.');
  return value;
}
export function arrayValue(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('Expected a JSON array.');
  return value as unknown[];
}

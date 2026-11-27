// Only errors authored by the plugin may be sent back to a model.
export class VaultAccessError extends Error {}

const reservedName = /^(?:con|prn|aux|nul|conin\$|conout\$|(?:com|lpt)[1-9¹²³])(?:\.|$)/i;
// A Windows short filename has at most eight characters before its extension.
const shortName = /^(?=[^.]{1,8}(?:\.|$))[^ .~]+~\d+(?:\.[^ .]{1,3})?$/i;
function invalidSegment(part: string): boolean {
  return !part || part.startsWith('.') || /[. ]$/.test(part) || /[<>:"|?*]/.test(part)
    || reservedName.test(part) || shortName.test(part);
}

export function safePath(value: unknown, folder = false): string {
  if (typeof value !== 'string') throw new VaultAccessError('A vault-relative path is required.');
  const input = value.trim().replace(/\\/g, '/');
  if (Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    throw new VaultAccessError('Vault paths cannot contain control characters.');
  if (!input && folder) return '';
  const path = folder ? input.replace(/\/$/, '') : input;
  if (input.startsWith('/') || path.split('/').some(invalidSegment))
    throw new VaultAccessError('Choose a vault-relative path without hidden folders, reserved names or ambiguous path segments.');
  if (!folder && !path.toLowerCase().endsWith('.md'))
    throw new VaultAccessError('Only Markdown notes (.md) are supported.');
  return path;
}

export function within(path: string, folder: string): boolean {
  return !folder || path === folder || path.startsWith(folder + '/');
}

export function exclusionKey(path: string): string {
  return path.normalize('NFC').toLowerCase();
}

/** Bounded, linear line comparison: preserve the common prefix and suffix. */
export function changedLines(before: string, after: string): string {
  const a = before.split('\n'), b = after.split('\n');
  let start = 0, end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  if (start === a.length && start === b.length) return 'No changes.';
  return [
    ...a.slice(Math.max(0, start - 2), start).map(s => '  ' + s),
    ...a.slice(start, a.length - end).map(s => '- ' + s),
    ...b.slice(start, b.length - end).map(s => '+ ' + s),
    ...a.slice(a.length - end, a.length - end + 2).map(s => '  ' + s)
  ].join('\n');
}

export function providerHelp(message: string): string {
  if (/401|unauthorized|invalid.*key/i.test(message)) return 'Check the API key in MechApe settings. A chat subscription does not include API access.';
  if (/402|credit|billing|balance/i.test(message)) return 'Check your provider’s API balance. Cloud usage is billed separately by your provider.';
  if (/429|rate.limit/i.test(message)) return 'The provider is limiting requests. Wait before retrying or choose another model.';
  if (/fetch|connect|ECONNREFUSED|network/i.test(message)) return 'Check the endpoint and connection. For local models, start Ollama or your compatible server first.';
  return 'Check the selected provider and model in chat options. Your draft is retained for retry.';
}

// Minimal word-level diff (LCS over whitespace-tokenized arrays).
// Returns ordered chunks for inline rendering.
export type DiffChunk = { type: 'eq' | 'add' | 'del'; text: string };

function tokenize(s: string): string[] {
  // Keep whitespace as its own tokens so output preserves spacing.
  return s.split(/(\s+)/).filter((x) => x.length > 0);
}

export function diffWords(before: string, after: string): DiffChunk[] {
  const a = tokenize(before || '');
  const b = tokenize(after || '');
  const n = a.length;
  const m = b.length;

  // Build LCS length table. Cap size to avoid pathological cost.
  const MAX = 4000;
  if (n > MAX || m > MAX) {
    // Fall back to whole-block diff for very large inputs.
    if (before === after) return [{ type: 'eq', text: before }];
    return [
      { type: 'del', text: before },
      { type: 'add', text: after },
    ];
  }

  const dp: Uint16Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Uint16Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffChunk[] = [];
  const push = (type: DiffChunk['type'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('eq', a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('del', a[i]);
      i++;
    } else {
      push('add', b[j]);
      j++;
    }
  }
  while (i < n) {
    push('del', a[i++]);
  }
  while (j < m) {
    push('add', b[j++]);
  }
  return out;
}

export function diffStats(chunks: DiffChunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const c of chunks) {
    if (c.type === 'add') added += c.text.trim() ? c.text.length : 0;
    else if (c.type === 'del') removed += c.text.trim() ? c.text.length : 0;
  }
  return { added, removed };
}
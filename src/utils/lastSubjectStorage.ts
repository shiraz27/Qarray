const KEY = (classId: number) => `lastSubject:${classId}`;

export function readLastSubject(classId: number): number | null {
  try {
    const raw = localStorage.getItem(KEY(classId));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeLastSubject(classId: number, subjectId: number): void {
  try {
    localStorage.setItem(KEY(classId), String(subjectId));
  } catch {
    /* ignore */
  }
}
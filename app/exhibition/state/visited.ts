// Which pieces this visitor has opened in this session. A per-visitor convenience only: the page works
// the same if storage is blocked or cleared.

const KEY = "victor-ceo:exhibition:visited";

export function loadVisited(): Set<number> {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}

export function saveVisited(visited: ReadonlySet<number>): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify([...visited]));
  } catch {
    // Storage can be blocked. The visited marks then last only as long as this page.
  }
}

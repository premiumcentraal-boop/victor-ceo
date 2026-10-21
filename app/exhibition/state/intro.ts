// Whether this visitor has already seen the galaxy's opening in this session. A per-visitor convenience
// only: if storage is blocked, the opening plays on every visit, which is harmless.

const KEY = "victor-ceo:exhibition:intro";

export function shouldPlayIntro(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === null;
  } catch {
    return true;
  }
}

export function markIntroPlayed(): void {
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage can be blocked. The opening then plays again on the next visit.
  }
}

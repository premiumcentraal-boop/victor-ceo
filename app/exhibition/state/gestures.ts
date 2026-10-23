// Whether this visitor has already been shown the gesture hint in this session. A per-visitor convenience
// only: if storage is blocked, the hint can show again, which is harmless.

const KEY = "victor-ceo:exhibition:gestures";

export function shouldShowGestureHint(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === null;
  } catch {
    return true;
  }
}

export function markGestureHintShown(): void {
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage can be blocked. The hint then shows again on the next piece.
  }
}

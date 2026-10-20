import { afterEach, describe, expect, it, vi } from "vitest";
import { markIntroPlayed, shouldPlayIntro } from "./intro";
import { loadVisited, saveVisited } from "./visited";

/** A sessionStorage stand-in. `blocked` makes every access throw, as private windows and blocked sites do. */
function fakeWindow(blocked = false) {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => {
      if (blocked) throw new DOMException("blocked", "SecurityError");
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (blocked) throw new DOMException("blocked", "SecurityError");
      store.set(key, value);
    },
  };
  return { sessionStorage: storage, store };
}

describe("visited pieces", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts empty", () => {
    vi.stubGlobal("window", fakeWindow());
    expect(loadVisited().size).toBe(0);
  });

  it("remembers what was saved, for the rest of the session", () => {
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    saveVisited(new Set([1, 4]));
    expect([...loadVisited()].sort()).toEqual([1, 4]);
  });

  it("ignores stored values that are not piece numbers", () => {
    const win = fakeWindow();
    win.store.set("victor-ceo:exhibition:visited", JSON.stringify([2, "x", 3.5, null]));
    vi.stubGlobal("window", win);
    expect([...loadVisited()]).toEqual([2]);
  });

  it("works without storage: nothing is remembered, and nothing throws", () => {
    vi.stubGlobal("window", fakeWindow(true));
    expect(loadVisited().size).toBe(0);
    expect(() => saveVisited(new Set([0]))).not.toThrow();
  });
});

describe("the opening", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("plays on the first visit of a session, and not after", () => {
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    expect(shouldPlayIntro()).toBe(true);
    markIntroPlayed();
    expect(shouldPlayIntro()).toBe(false);
  });

  it("plays again each time when storage is blocked, which is harmless", () => {
    vi.stubGlobal("window", fakeWindow(true));
    expect(shouldPlayIntro()).toBe(true);
    expect(() => markIntroPlayed()).not.toThrow();
    expect(shouldPlayIntro()).toBe(true);
  });
});

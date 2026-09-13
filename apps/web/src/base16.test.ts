import { describe, expect, it, vi } from "vite-plus/test";

import {
  applyBase16ToRoot,
  BASE16_KEYS,
  BASE16_STORAGE_KEY,
  buildKonachanPostsUrl,
  buildKonachanPostUrl,
  DEFAULT_BASE16_STATE,
  DEFAULT_BASE16_SLOT_SOURCES,
  ditherImageData,
  ditherWorkingSize,
  fetchRandomKonachanImage,
  isDirectImageUrl,
  konachanImageFromPosts,
  normalizeHexColor,
  normalizeKonachanTags,
  parseBase16State,
  parseKonachanPostId,
  readBase16State,
  resolveBase16Palette,
  resolveBackgroundImageUrl,
  writeBase16State,
} from "./base16";

function makeRoot() {
  const setProperty = vi.fn();
  const removeProperty = vi.fn();
  return {
    root: {
      dataset: {} as Record<string, string>,
      style: { setProperty, removeProperty },
    } as unknown as HTMLElement,
    setProperty,
    removeProperty,
  };
}

describe("normalizeHexColor", () => {
  it("accepts #rrggbb with or without the hash", () => {
    expect(normalizeHexColor("#18191C")).toBe("#18191c");
    expect(normalizeHexColor("18191c")).toBe("#18191c");
  });

  it("expands #rgb shorthand", () => {
    expect(normalizeHexColor("#abc")).toBe("#aabbcc");
  });

  it("rejects non-colors", () => {
    expect(normalizeHexColor("red")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor("")).toBeNull();
  });
});

describe("resolveBase16Palette", () => {
  it("lets one role use another slot without changing the source role", () => {
    const palette = DEFAULT_BASE16_STATE.palette;
    const resolved = resolveBase16Palette(palette, {
      ...DEFAULT_BASE16_SLOT_SOURCES,
      base0D: "base0A",
    });
    expect(resolved.base0D).toBe(palette.base0A);
    expect(resolved.base0A).toBe(palette.base0A);
    expect(resolved.base00).toBe(palette.base00);
  });
});

describe("parseBase16State", () => {
  it("falls back to defaults for garbage", () => {
    expect(parseBase16State(null)).toEqual(DEFAULT_BASE16_STATE);
    expect(parseBase16State("nope")).toEqual(DEFAULT_BASE16_STATE);
  });

  it("keeps valid slots and drops invalid ones", () => {
    const parsed = parseBase16State({
      enabled: true,
      palette: { base00: "#000000", base0D: "junk", baseZZ: "#ffffff" },
      background: { ditherLevels: 99, surfaceOpacity: 12, imageUrl: "ftp://x" },
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.palette.base00).toBe("#000000");
    expect(parsed.palette.base0D).toBe(DEFAULT_BASE16_STATE.palette.base0D);
    expect(parsed.slotSources).toEqual(DEFAULT_BASE16_SLOT_SOURCES);
    expect(parsed.background.ditherLevels).toBe(16);
    expect(parsed.background.surfaceOpacity).toBe(40);
    expect(parsed.background.backdropDim).toBe(55);
    expect(parsed.background.imageDarken).toBe(0);
    expect(parsed.background.imageUrl).toBe("");
    expect(
      parseBase16State({ background: { imageDarken: 99, backdropDim: -5 } }).background,
    ).toMatchObject({ imageDarken: 80, backdropDim: 0 });
  });

  it("keeps valid per-role sources and resets invalid ones", () => {
    const parsed = parseBase16State({
      slotSources: { base0D: "base0A", base0A: "baseZZ" },
    });
    expect(parsed.slotSources.base0D).toBe("base0A");
    expect(parsed.slotSources.base0A).toBe("base0A");
  });
});

describe("applyBase16ToRoot", () => {
  it("writes every slot plus the opt-in attributes", () => {
    const { root, setProperty } = makeRoot();
    applyBase16ToRoot(root, {
      ...DEFAULT_BASE16_STATE,
      enabled: true,
      background: { ...DEFAULT_BASE16_STATE.background, imageUrl: "https://x/y.png" },
    });
    expect(root.dataset.base16).toBe("on");
    expect(root.dataset.base16Bg).toBe("on");
    for (const key of BASE16_KEYS) {
      expect(setProperty).toHaveBeenCalledWith(`--${key}`, expect.any(String));
    }
    expect(setProperty).toHaveBeenCalledWith("--base16-bg-darken", "0%");
  });

  it("writes independently resolved slot colors", () => {
    const { root, setProperty } = makeRoot();
    applyBase16ToRoot(root, {
      ...DEFAULT_BASE16_STATE,
      enabled: true,
      slotSources: { ...DEFAULT_BASE16_SLOT_SOURCES, base0D: "base0A" },
    });
    expect(setProperty).toHaveBeenCalledWith("--base0D", DEFAULT_BASE16_STATE.palette.base0A);
    expect(setProperty).toHaveBeenCalledWith("--base0A", DEFAULT_BASE16_STATE.palette.base0A);
  });

  it("clears everything when disabled", () => {
    const { root, removeProperty } = makeRoot();
    root.dataset.base16 = "on";
    applyBase16ToRoot(root, DEFAULT_BASE16_STATE);
    expect(root.dataset.base16).toBeUndefined();
    expect(root.dataset.base16Bg).toBeUndefined();
    expect(removeProperty).toHaveBeenCalledWith("--base00");
    expect(removeProperty).toHaveBeenCalledWith("--base16-bg-darken");
  });
});

describe("readBase16State", () => {
  it("returns a stable snapshot reference until storage changes", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
    vi.stubGlobal("document", {
      documentElement: {
        dataset: {} as Record<string, string>,
        style: { setProperty: vi.fn(), removeProperty: vi.fn() },
      },
    });
    try {
      // A fresh object per call reads as "changed" to useSyncExternalStore
      // and loops the renderer (React #185).
      expect(readBase16State()).toBe(readBase16State());
      writeBase16State({ ...DEFAULT_BASE16_STATE, enabled: true });
      const after = readBase16State();
      expect(after.enabled).toBe(true);
      expect(readBase16State()).toBe(after);
      expect(store.get(BASE16_STORAGE_KEY)).toContain('"enabled":true');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("konachan helpers", () => {
  it("parses post page URLs into ids", () => {
    expect(parseKonachanPostId("https://konachan.net/post/show/405290")).toBe(405290);
    expect(parseKonachanPostId("http://konachan.com/post/show/12/")).toBe(12);
    expect(parseKonachanPostId("https://konachan.net/post")).toBeNull();
    expect(parseKonachanPostId("https://example.com/post/show/1")).toBeNull();
    expect(parseKonachanPostId("junk")).toBeNull();
  });

  it("recognizes direct image URLs including extensionless konachan files", () => {
    expect(isDirectImageUrl("https://example.com/wallpaper.png")).toBe(true);
    expect(
      isDirectImageUrl("https://konachan.net/image/8eef07e0/Konachan.com%20-%20405290.png"),
    ).toBe(true);
    expect(isDirectImageUrl("https://konachan.net/post/show/405290")).toBe(false);
    expect(isDirectImageUrl("not a url")).toBe(false);
  });

  it("builds the random and post API URLs", () => {
    expect(buildKonachanPostsUrl(["sky"])).toContain("order%3Arandom");
    expect(buildKonachanPostsUrl(["sky"])).toContain("rating%3Asafe");
    expect(buildKonachanPostUrl(405290)).toContain("id%3A405290");
  });

  it("normalizes tag input and drops metatags", () => {
    expect(normalizeKonachanTags("Sky  sky  order:random rating:safe width:>=100")).toEqual([
      "sky",
    ]);
  });

  it("reads an image out of a post.json payload", () => {
    expect(
      konachanImageFromPosts([{ id: 1, file_url: "https://konachan.net/image/a/b.png" }]),
    ).toEqual({
      imageUrl: "https://konachan.net/image/a/b.png",
      pageUrl: "https://konachan.net/post/show/1",
    });
    expect(() => konachanImageFromPosts([])).toThrow();
    expect(() => konachanImageFromPosts([{ id: 1 }])).toThrow();
  });

  it("resolves direct URLs without touching the network", async () => {
    await expect(resolveBackgroundImageUrl("https://example.com/a.jpg")).resolves.toEqual({
      imageUrl: "https://example.com/a.jpg",
      pageUrl: "https://example.com/a.jpg",
    });
    await expect(resolveBackgroundImageUrl("junk")).rejects.toThrow();
  });

  it("explains CORS when the API is unreachable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("boom"));
    try {
      await expect(fetchRandomKonachanImage("sky")).rejects.toThrow(/CORS/);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("ditherImageData", () => {
  it("quantizes every channel to the requested levels", () => {
    const data = new Uint8ClampedArray([10, 120, 250, 255, 33, 200, 77, 255]);
    ditherImageData(data, 2, 1, 2, 0);
    for (let i = 0; i < data.length; i += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        expect([0, 255]).toContain(data[i + channel]);
      }
      expect(data[i + 3]).toBe(255);
    }
  });

  it("is deterministic for the same seed", () => {
    const first = new Uint8ClampedArray([10, 120, 250, 255]);
    const second = new Uint8ClampedArray([10, 120, 250, 255]);
    ditherImageData(first, 1, 1, 6, 0.08);
    ditherImageData(second, 1, 1, 6, 0.08);
    expect([...first]).toEqual([...second]);
  });
});

describe("ditherWorkingSize", () => {
  it("caps the longest edge and keeps aspect", () => {
    expect(ditherWorkingSize(4000, 2000, 1)).toEqual({ width: 1600, height: 800 });
    expect(ditherWorkingSize(800, 600, 2)).toEqual({ width: 400, height: 300 });
  });
});

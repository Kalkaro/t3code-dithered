import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  DEFAULT_BASE16_PALETTE,
  DEFAULT_BASE16_SLOT_SOURCES,
  DEFAULT_BASE16_STATE,
} from "./base16";
import {
  BASE16_THEME_ID,
  base16ThemeColors,
  base16ThemeDefinition,
  base16WithOpacity,
  ensureBase16ThemeInstalled,
  isDarkBase16Palette,
} from "./base16Theme";
import {
  CUSTOM_THEMES_STORAGE_KEY,
  getThemeDefinition,
  invalidateCustomThemes,
} from "./themePalette";

function stubThemeStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
  invalidateCustomThemes();
  return store;
}

afterEach(() => {
  invalidateCustomThemes();
  vi.unstubAllGlobals();
});

describe("isDarkBase16Palette", () => {
  it("treats the default palette as dark", () => {
    expect(isDarkBase16Palette(DEFAULT_BASE16_PALETTE)).toBe(true);
  });

  it("treats a light base00 as light", () => {
    expect(isDarkBase16Palette({ ...DEFAULT_BASE16_PALETTE, base00: "#fafafa" })).toBe(false);
  });
});

describe("base16WithOpacity", () => {
  it("leaves fully opaque colors alone", () => {
    expect(base16WithOpacity("#18191c", 100)).toBe("#18191c");
    expect(base16WithOpacity("#18191c", 140)).toBe("#18191c");
  });

  it("bakes translucency into an alpha suffix", () => {
    expect(base16WithOpacity("#18191c", 50)).toBe("#18191c80");
    expect(base16WithOpacity("#18191c", 0)).toBe("#18191c00");
  });
});

describe("base16ThemeDefinition", () => {
  it("maps every surface onto base slots", () => {
    const definition = base16ThemeDefinition({
      ...DEFAULT_BASE16_STATE,
      background: { ...DEFAULT_BASE16_STATE.background, surfaceOpacity: 100, backdropDim: 100 },
    });
    expect(definition.id).toBe(BASE16_THEME_ID);
    expect(definition.appearance).toBe("dark");
    expect(definition.colors.canvas).toBe(DEFAULT_BASE16_PALETTE.base00);
    expect(definition.colors.sidebar).toBe(DEFAULT_BASE16_PALETTE.base00);
    expect(definition.colors.text).toBe(DEFAULT_BASE16_PALETTE.base05);
    expect(definition.colors.accent).toBe(DEFAULT_BASE16_PALETTE.base0D);
    expect(definition.colors.error).toBe(DEFAULT_BASE16_PALETTE.base08);
    expect(definition.colors.warning).toBe(DEFAULT_BASE16_PALETTE.base09);
    expect(definition.colors.terminalCursor).toBe(DEFAULT_BASE16_PALETTE.base0D);
  });

  it("applies role sources independently", () => {
    const definition = base16ThemeDefinition({
      ...DEFAULT_BASE16_STATE,
      slotSources: { ...DEFAULT_BASE16_SLOT_SOURCES, base0D: "base0A" },
      background: { ...DEFAULT_BASE16_STATE.background, surfaceOpacity: 100, backdropDim: 100 },
    });
    expect(definition.colors.accent).toBe(DEFAULT_BASE16_PALETTE.base0A);
    expect(definition.colors.warning).toBe(DEFAULT_BASE16_PALETTE.base09);
  });

  it("bakes opacities into backdrop and surface roles separately", () => {
    const colors = base16ThemeColors(DEFAULT_BASE16_PALETTE, {
      surfaceOpacity: 50,
      backdropDim: 25,
    });
    expect(colors.canvas).toBe(`${DEFAULT_BASE16_PALETTE.base00}40`);
    expect(colors.sidebar).toBe(`${DEFAULT_BASE16_PALETTE.base00}40`);
    expect(colors.surface).toBe(`${DEFAULT_BASE16_PALETTE.base01}80`);
    expect(colors.text).toBe(DEFAULT_BASE16_PALETTE.base05);
    expect(colors.accent).toBe(DEFAULT_BASE16_PALETTE.base0D);
  });
});

describe("ensureBase16ThemeInstalled", () => {
  it("installs once, then refreshes the same theme", () => {
    const store = stubThemeStorage();

    ensureBase16ThemeInstalled(DEFAULT_BASE16_STATE);
    expect(getThemeDefinition(BASE16_THEME_ID)?.appearance).toBe("dark");
    const storedAfterInstall = store.get(CUSTOM_THEMES_STORAGE_KEY);
    expect(storedAfterInstall).toContain(BASE16_THEME_ID);

    ensureBase16ThemeInstalled({
      ...DEFAULT_BASE16_STATE,
      palette: { ...DEFAULT_BASE16_PALETTE, base00: "#000000" },
    });
    expect(getThemeDefinition(BASE16_THEME_ID)?.colors.canvas).toContain("oklch");
    // Still a single theme, not a duplicate.
    expect(JSON.parse(store.get(CUSTOM_THEMES_STORAGE_KEY) ?? "[]")).toHaveLength(1);
  });
});

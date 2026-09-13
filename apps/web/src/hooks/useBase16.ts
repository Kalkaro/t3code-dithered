import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_BASE16_PALETTE,
  DEFAULT_BASE16_SLOT_SOURCES,
  fetchRandomKonachanImage,
  normalizeHexColor,
  readBase16State,
  resolveBase16Palette,
  resolveBackgroundImageUrl,
  subscribeToBase16,
  updateBase16State,
  type Base16BackgroundSettings,
  type Base16Key,
  type Base16State,
} from "../base16";
import { generateBase16Palette } from "../base16Server";
import { BASE16_THEME_ID, ensureBase16ThemeInstalled, isDarkBase16Palette } from "../base16Theme";
import { readThemePreference, useTheme } from "./useTheme";

export function useBase16State(): Base16State {
  return useSyncExternalStore(subscribeToBase16, readBase16State, readBase16State);
}

function readSelectedThemeSafely(): string {
  try {
    return readThemePreference();
  } catch {
    return "system";
  }
}

export function useBase16Actions() {
  // Refreshing is owned by Base16AppearanceSync: it repaints after every
  // state change when the generated theme is selected, so actions here only
  // write state (plus install/select on enable).
  const { setTheme } = useTheme();

  const setEnabled = useCallback(
    (next: boolean) => {
      if (next) {
        const stored = readSelectedThemeSafely();
        updateBase16State((state) => ({
          ...state,
          enabled: true,
          previousTheme: stored === BASE16_THEME_ID ? state.previousTheme : stored,
        }));
        ensureBase16ThemeInstalled(readBase16State());
        setTheme(BASE16_THEME_ID);
      } else {
        const previousTheme = readBase16State().previousTheme;
        const fallback =
          previousTheme && previousTheme !== BASE16_THEME_ID ? previousTheme : "system";
        updateBase16State((state) => ({ ...state, enabled: false }));
        setTheme(fallback);
      }
    },
    [setTheme],
  );

  const setSlot = useCallback((key: Base16Key, raw: string): boolean => {
    const normalized = normalizeHexColor(raw);
    if (normalized === null) return false;
    updateBase16State((state) => {
      if (state.palette[key] === normalized) return state;
      return { ...state, palette: { ...state.palette, [key]: normalized } };
    });
    return true;
  }, []);

  const resetPalette = useCallback(() => {
    updateBase16State((state) => ({
      ...state,
      palette: DEFAULT_BASE16_PALETTE,
      slotSources: DEFAULT_BASE16_SLOT_SOURCES,
    }));
  }, []);

  const setSlotSource = useCallback((key: Base16Key, source: Base16Key) => {
    updateBase16State((state) => ({
      ...state,
      slotSources: { ...state.slotSources, [key]: source },
    }));
  }, []);

  const setBackground = useCallback((patch: Partial<Base16BackgroundSettings>) => {
    updateBase16State((state) => ({ ...state, background: { ...state.background, ...patch } }));
  }, []);

  const applyImageUrl = useCallback(async (input: string) => {
    const resolved = await resolveBackgroundImageUrl(input);
    const current = readBase16State();
    const palette = await generateBase16Palette(
      resolved.imageUrl,
      isDarkBase16Palette(resolveBase16Palette(current.palette, current.slotSources))
        ? "dark"
        : "light",
    );
    updateBase16State((state) => ({
      ...state,
      palette,
      background: { ...state.background, imageUrl: resolved.imageUrl },
    }));
    return resolved;
  }, []);

  const applyRandomKonachanImage = useCallback(async (tags: string) => {
    const resolved = await fetchRandomKonachanImage(tags);
    const current = readBase16State();
    const palette = await generateBase16Palette(
      resolved.imageUrl,
      isDarkBase16Palette(resolveBase16Palette(current.palette, current.slotSources))
        ? "dark"
        : "light",
    );
    updateBase16State((state) => ({
      ...state,
      palette,
      background: { ...state.background, imageUrl: resolved.imageUrl },
    }));
    return resolved;
  }, []);

  const clearImage = useCallback(() => {
    updateBase16State((state) => ({
      ...state,
      background: { ...state.background, imageUrl: "" },
    }));
  }, []);

  return {
    setEnabled,
    setSlot,
    setSlotSource,
    resetPalette,
    setBackground,
    applyImageUrl,
    applyRandomKonachanImage,
    clearImage,
  } as const;
}

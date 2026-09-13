/**
 * Base16 as a first-class theme: the sixteen slots map onto every theme
 * color role exactly (no perceptual derivation), so the whole GUI wears the
 * palette the user configured — base00 for all backgrounds instead of gray,
 * base05 for text, base0D for accents, and so on.
 *
 * The definition is installed into the custom theme library (localStorage,
 * like hand-made themes) under a fixed id. Enabling Base16 selects it;
 * disabling restores the previously selected theme.
 */

import type { ThemeColors, ThemeDefinition } from "@t3tools/shared/themePalettes";

import { resolveBase16Palette, type Base16Palette, type Base16State } from "./base16";
import { getCustomThemes, installCustomTheme, updateCustomTheme } from "./themePalette";

export const BASE16_THEME_ID = "base16";
export const BASE16_THEME_LABEL = "Base16";

/**
 * Dark when base00 is dark, mirroring the luminance cut the vivid palette
 * engine uses. Decides the theme appearance (and with it the `.dark` class)
 * plus which end of the palette hosts on-accent foregrounds.
 */
export function isDarkBase16Palette(palette: Base16Palette): boolean {
  return relativeLuminance(palette.base00) < 0.179;
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  if (![red, green, blue].every((channel) => Number.isInteger(channel))) return 1;
  return (
    0.2126 * channelToLinear(red) + 0.7152 * channelToLinear(green) + 0.0722 * channelToLinear(blue)
  );
}

/**
 * Bake a surface opacity into a hex color. Fully opaque stays a plain
 * `#rrggbb` so the stored theme is identical with the slider at 100%.
 */
export function base16WithOpacity(hex: string, opacityPercent: number): string {
  if (opacityPercent >= 100) return hex;
  const alpha = Math.round((Math.min(100, Math.max(0, opacityPercent)) / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alpha}`;
}

export interface Base16SurfaceOpacities {
  /** Cards, the composer, controls: where text lives. */
  readonly surfaceOpacity: number;
  /** Page, sidebar, toolbar: the backdrop the image shows through. */
  readonly backdropDim: number;
}

export function base16ThemeColors(
  palette: Base16Palette,
  opacities: Base16SurfaceOpacities,
): ThemeColors {
  const dark = isDarkBase16Palette(palette);
  // Foregrounds drawn on top of the accent/status colors.
  const onAccent = dark ? palette.base00 : palette.base07;
  const surface = (hex: string) => base16WithOpacity(hex, opacities.surfaceOpacity);
  // Structural backdrop recedes so the image shows; text-bearing components
  // stay solid rounded cards on top of it.
  const backdrop = (hex: string) => base16WithOpacity(hex, opacities.backdropDim);
  return {
    canvas: backdrop(palette.base00),
    chrome: backdrop(palette.base00),
    toolbar: backdrop(palette.base00),
    toolbarForeground: palette.base05,
    toolbarBorder: palette.base02,
    toolbarControl: surface(palette.base01),
    toolbarControlForeground: palette.base05,
    toolbarControlHover: palette.base02,
    surface: surface(palette.base01),
    surfaceRaised: surface(palette.base01),
    surfaceOverlay: surface(palette.base01),
    text: palette.base05,
    textMuted: palette.base04,
    border: palette.base02,
    input: palette.base02,
    focus: palette.base0D,
    accent: palette.base0D,
    accentForeground: onAccent,
    secondary: surface(palette.base01),
    secondaryForeground: palette.base05,
    muted: surface(palette.base01),
    mutedForeground: palette.base04,
    placeholder: palette.base03,
    secondaryLabel: palette.base04,
    iconMuted: palette.base04,
    error: palette.base08,
    errorForeground: dark ? palette.base07 : palette.base00,
    errorSurface: surface(palette.base00),
    warning: palette.base09,
    warningForeground: dark ? palette.base07 : palette.base00,
    warningSurface: surface(palette.base00),
    update: palette.base0D,
    updateForeground: palette.base05,
    updateSurface: surface(palette.base01),
    accentSurface: surface(palette.base02),
    accentSurfaceForeground: palette.base05,
    messageSurface: surface(palette.base01),
    messageForeground: palette.base05,
    messageAction: palette.base0D,
    messageActionForeground: onAccent,
    messageActionHover: palette.base0D,
    codeBackground: surface(palette.base01),
    codeForeground: palette.base05,
    sidebar: backdrop(palette.base00),
    sidebarForeground: palette.base05,
    sidebarMutedForeground: palette.base04,
    sidebarControlSurface: surface(palette.base01),
    sidebarRowHover: palette.base01,
    sidebarRowActive: palette.base02,
    sidebarRowSelected: palette.base02,
    sidebarBorder: palette.base02,
    terminalBackground: backdrop(palette.base00),
    terminalForeground: palette.base05,
    terminalCursor: palette.base0D,
    terminalSelection: palette.base02,
    terminalScrollbar: palette.base02,
    terminalScrollbarHover: palette.base03,
  };
}

export function base16ThemeDefinition(state: Base16State): ThemeDefinition {
  const palette = resolveBase16Palette(state.palette, state.slotSources);
  const dark = isDarkBase16Palette(palette);
  return {
    id: BASE16_THEME_ID,
    label: BASE16_THEME_LABEL,
    appearance: dark ? "dark" : "light",
    colors: base16ThemeColors(palette, {
      surfaceOpacity: state.background.surfaceOpacity,
      backdropDim: state.background.backdropDim,
    }),
  };
}

/**
 * Install the generated theme on first use, refresh it afterwards. A custom
 * theme that happens to share the id is adopted: the id is fixed so the
 * selection survives reloads.
 */
export function ensureBase16ThemeInstalled(state: Base16State): void {
  const definition = base16ThemeDefinition(state);
  try {
    if (getCustomThemes().some((theme) => theme.id === BASE16_THEME_ID)) {
      updateCustomTheme(definition);
    } else {
      installCustomTheme(definition);
    }
  } catch {
    // Storage blocked or full: the palette still applies to this tab through
    // the next refresh, it just will not persist.
  }
}

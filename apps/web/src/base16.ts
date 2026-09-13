/**
 * Base16 palette override + custom background with palettegen-style dithering.
 *
 * Web-only and client-local (localStorage, like the custom theme library):
 * the desktop app inherits it because it wraps the web UI. Mobile is a
 * separate React Native surface and does not read this module yet.
 *
 * The palette remaps every GUI surface: when enabled, `index.css` points the
 * app tokens at `--base00 … --base0F`. Each role can independently source
 * another slot, so using base0A for base0D does not also replace base0A.
 */

export const BASE16_STORAGE_KEY = "t3code:base16-background:v1";

export const BASE16_KEYS = [
  "base00",
  "base01",
  "base02",
  "base03",
  "base04",
  "base05",
  "base06",
  "base07",
  "base08",
  "base09",
  "base0A",
  "base0B",
  "base0C",
  "base0D",
  "base0E",
  "base0F",
] as const;

export type Base16Key = (typeof BASE16_KEYS)[number];
export type Base16Palette = Record<Base16Key, string>;
export type Base16SlotSources = Record<Base16Key, Base16Key>;

/** Short role hints shown under each slot in Settings. */
export const BASE16_ROLE_HINTS: Record<Base16Key, string> = {
  base00: "background",
  base01: "lighter background",
  base02: "selection",
  base03: "muted text",
  base04: "dark foreground",
  base05: "foreground",
  base06: "light foreground",
  base07: "light background",
  base08: "red · errors",
  base09: "orange · warnings",
  base0A: "yellow",
  base0B: "green · success",
  base0C: "cyan",
  base0D: "blue · accent",
  base0E: "purple",
  base0F: "brown",
};

export const DEFAULT_BASE16_PALETTE: Base16Palette = {
  base00: "#18191c",
  base01: "#25272c",
  base02: "#3b3e45",
  base03: "#686c74",
  base04: "#a6a9b0",
  base05: "#e4e5e7",
  base06: "#f0f1f2",
  base07: "#fafafa",
  base08: "#e06c75",
  base09: "#d19a66",
  base0A: "#e5c07b",
  base0B: "#98c379",
  base0C: "#56b6c2",
  base0D: "#61afef",
  base0E: "#c678dd",
  base0F: "#be5046",
};

export const DEFAULT_BASE16_SLOT_SOURCES: Base16SlotSources = {
  base00: "base00",
  base01: "base01",
  base02: "base02",
  base03: "base03",
  base04: "base04",
  base05: "base05",
  base06: "base06",
  base07: "base07",
  base08: "base08",
  base09: "base09",
  base0A: "base0A",
  base0B: "base0B",
  base0C: "base0C",
  base0D: "base0D",
  base0E: "base0E",
  base0F: "base0F",
};

export const MIN_DITHER_LEVELS = 2;
export const MAX_DITHER_LEVELS = 16;
export const DEFAULT_DITHER_LEVELS = 6;
export const MIN_DITHER_GRAIN = 0;
export const MAX_DITHER_GRAIN = 30;
export const DEFAULT_DITHER_GRAIN = 8;
export const MIN_DITHER_PIXEL_SIZE = 1;
export const MAX_DITHER_PIXEL_SIZE = 4;
export const DEFAULT_DITHER_PIXEL_SIZE = 2;
export const MIN_SURFACE_OPACITY = 40;
export const MAX_SURFACE_OPACITY = 100;
export const DEFAULT_SURFACE_OPACITY = 88;
export const MIN_BACKDROP_DIM = 0;
export const MAX_BACKDROP_DIM = 100;
export const DEFAULT_BACKDROP_DIM = 55;
export const MIN_IMAGE_DARKEN = 0;
export const MAX_IMAGE_DARKEN = 80;
export const DEFAULT_IMAGE_DARKEN = 0;
/** Bound dither work for very large wallpapers, like palettegen does. */
export const DITHER_MAX_DIMENSION = 1600;

export interface Base16BackgroundSettings {
  readonly imageUrl: string;
  readonly konachanTags: string;
  readonly ditherEnabled: boolean;
  readonly ditherLevels: number;
  readonly ditherGrain: number;
  readonly ditherPixelSize: number;
  /** How solid cards, the composer, and controls stay over the image, in percent. */
  readonly surfaceOpacity: number;
  /** How solid the page and sidebar backdrop stay. Lower lets the image through. */
  readonly backdropDim: number;
  /** Flat black overlay over the image itself, in percent. Readability without the veil. */
  readonly imageDarken: number;
}

export interface Base16State {
  readonly enabled: boolean;
  readonly palette: Base16Palette;
  /** Palette slot supplying each semantic Base16 role. */
  readonly slotSources: Base16SlotSources;
  readonly background: Base16BackgroundSettings;
  /**
   * The theme preference active before Base16 took over, restored on disable.
   * Empty means "never captured" and falls back to the system preference.
   */
  readonly previousTheme: string;
}

export const DEFAULT_BASE16_STATE: Base16State = {
  enabled: false,
  palette: DEFAULT_BASE16_PALETTE,
  slotSources: DEFAULT_BASE16_SLOT_SOURCES,
  previousTheme: "",
  background: {
    imageUrl: "",
    konachanTags: "",
    ditherEnabled: true,
    ditherLevels: DEFAULT_DITHER_LEVELS,
    ditherGrain: DEFAULT_DITHER_GRAIN,
    ditherPixelSize: DEFAULT_DITHER_PIXEL_SIZE,
    surfaceOpacity: DEFAULT_SURFACE_OPACITY,
    backdropDim: DEFAULT_BACKDROP_DIM,
    imageDarken: DEFAULT_IMAGE_DARKEN,
  },
};

const HEX_6 = /^[0-9a-f]{6}$/;
const HEX_3 = /^[0-9a-f]{3}$/;

/**
 * Normalize user input (`#abc`, `abc`, `#aabbcc`) to lowercase `#rrggbb`,
 * or null when it is not a hex color.
 */
export function normalizeHexColor(input: string): string | null {
  const bare = input.trim().toLowerCase().replace(/^#/, "");
  if (HEX_6.test(bare)) return `#${bare}`;
  if (HEX_3.test(bare)) {
    return `#${bare
      .split("")
      .map((channel) => channel + channel)
      .join("")}`;
  }
  return null;
}

export function resolveBase16Palette(
  palette: Base16Palette,
  slotSources: Base16SlotSources,
): Base16Palette {
  return Object.fromEntries(
    BASE16_KEYS.map((key) => [key, palette[slotSources[key]]]),
  ) as Base16Palette;
}

function clampInt(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePalette(value: unknown): Base16Palette {
  const palette = { ...DEFAULT_BASE16_PALETTE };
  if (!isRecord(value)) return palette;
  for (const key of BASE16_KEYS) {
    const raw = value[key];
    if (typeof raw === "string") {
      const normalized = normalizeHexColor(raw);
      if (normalized !== null) palette[key] = normalized;
    }
  }
  return palette;
}

function parseSlotSources(value: unknown): Base16SlotSources {
  const slotSources = { ...DEFAULT_BASE16_SLOT_SOURCES };
  if (!isRecord(value)) return slotSources;
  for (const key of BASE16_KEYS) {
    const source = value[key];
    if (typeof source === "string" && BASE16_KEYS.includes(source as Base16Key)) {
      slotSources[key] = source as Base16Key;
    }
  }
  return slotSources;
}

function parseBackground(value: unknown): Base16BackgroundSettings {
  const fallback = DEFAULT_BASE16_STATE.background;
  if (!isRecord(value)) return fallback;
  const imageUrl = typeof value.imageUrl === "string" ? value.imageUrl.trim().slice(0, 2048) : "";
  const konachanTags =
    typeof value.konachanTags === "string" ? value.konachanTags.trim().slice(0, 256) : "";
  return {
    imageUrl: isHttpUrl(imageUrl) ? imageUrl : "",
    konachanTags,
    ditherEnabled:
      typeof value.ditherEnabled === "boolean" ? value.ditherEnabled : fallback.ditherEnabled,
    ditherLevels: clampInt(
      value.ditherLevels,
      MIN_DITHER_LEVELS,
      MAX_DITHER_LEVELS,
      fallback.ditherLevels,
    ),
    ditherGrain: clampInt(
      value.ditherGrain,
      MIN_DITHER_GRAIN,
      MAX_DITHER_GRAIN,
      fallback.ditherGrain,
    ),
    ditherPixelSize: clampInt(
      value.ditherPixelSize,
      MIN_DITHER_PIXEL_SIZE,
      MAX_DITHER_PIXEL_SIZE,
      fallback.ditherPixelSize,
    ),
    surfaceOpacity: clampInt(
      value.surfaceOpacity,
      MIN_SURFACE_OPACITY,
      MAX_SURFACE_OPACITY,
      fallback.surfaceOpacity,
    ),
    backdropDim: clampInt(
      value.backdropDim,
      MIN_BACKDROP_DIM,
      MAX_BACKDROP_DIM,
      fallback.backdropDim,
    ),
    imageDarken: clampInt(
      value.imageDarken,
      MIN_IMAGE_DARKEN,
      MAX_IMAGE_DARKEN,
      fallback.imageDarken,
    ),
  };
}

export function parseBase16State(value: unknown): Base16State {
  if (!isRecord(value)) return DEFAULT_BASE16_STATE;
  const previousTheme =
    typeof value.previousTheme === "string" ? value.previousTheme.slice(0, 64) : "";
  return {
    enabled: value.enabled === true,
    palette: parsePalette(value.palette),
    slotSources: parseSlotSources(value.slotSources),
    background: parseBackground(value.background),
    previousTheme,
  };
}

/**
 * useSyncExternalStore requires a cached snapshot: returning a fresh object
 * per call reads as "changed" on every render and loops forever (React #185).
 * The cache keys on the raw string, so cross-tab writes still re-parse.
 */
let lastStoredRaw: string | null | undefined;
let lastParsedState: Base16State = DEFAULT_BASE16_STATE;

function parseStoredBase16State(raw: string | null): Base16State {
  if (raw === null) return DEFAULT_BASE16_STATE;
  try {
    return parseBase16State(JSON.parse(raw));
  } catch {
    return DEFAULT_BASE16_STATE;
  }
}

export function readBase16State(): Base16State {
  if (typeof window === "undefined") return DEFAULT_BASE16_STATE;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(BASE16_STORAGE_KEY);
  } catch {
    return DEFAULT_BASE16_STATE;
  }
  if (raw !== lastStoredRaw) {
    lastStoredRaw = raw;
    lastParsedState = parseStoredBase16State(raw);
  }
  return lastParsedState;
}

const base16Listeners = new Set<() => void>();

function notifyBase16Listeners(): void {
  for (const listener of base16Listeners) listener();
}

export function subscribeToBase16(listener: () => void): () => void {
  base16Listeners.add(listener);
  if (typeof window === "undefined") return () => base16Listeners.delete(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === BASE16_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    base16Listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function writeBase16State(next: Base16State): void {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(next);
    window.localStorage.setItem(BASE16_STORAGE_KEY, raw);
    lastStoredRaw = raw;
    lastParsedState = next;
  } catch {
    // Preview still applies in memory when storage is unavailable.
  }
  applyBase16ToRoot(document.documentElement, next);
  notifyBase16Listeners();
}

export function updateBase16State(update: (current: Base16State) => Base16State): void {
  writeBase16State(update(readBase16State()));
}

/**
 * Point the document at the palette (or clear it). The static mapping from
 * app tokens to `--baseXX` lives in `index.css`, so this only writes the
 * sixteen values plus the two opt-in attributes.
 */
export function applyBase16ToRoot(root: HTMLElement, state: Base16State): void {
  if (!state.enabled) {
    delete root.dataset.base16;
    delete root.dataset.base16Bg;
    root.style.removeProperty("--base16-surface-opacity");
    root.style.removeProperty("--base16-bg-darken");
    for (const key of BASE16_KEYS) root.style.removeProperty(`--${key}`);
    return;
  }
  root.dataset.base16 = "on";
  const palette = resolveBase16Palette(state.palette, state.slotSources);
  for (const key of BASE16_KEYS) root.style.setProperty(`--${key}`, palette[key]);
  root.style.setProperty("--base16-surface-opacity", `${state.background.surfaceOpacity}%`);
  if (state.background.imageUrl) {
    root.dataset.base16Bg = "on";
    root.style.setProperty("--base16-bg-darken", `${state.background.imageDarken}%`);
  } else {
    delete root.dataset.base16Bg;
    root.style.removeProperty("--base16-bg-darken");
  }
}

// Paint before first render so an enabled palette never flashes the default
// theme, mirroring what the theme module does on import.
if (typeof document !== "undefined" && typeof window !== "undefined") {
  try {
    applyBase16ToRoot(document.documentElement, readBase16State());
  } catch {
    // A hostile stored value must never break startup.
  }
}

// ── Custom background: URLs + Konachan ──────────────────────────────────────

const KONACHAN_HOSTS = new Set(["konachan.net", "konachan.com"]);
const KONACHAN_POST_PATH = /\/post\/show\/(\d+)/i;
const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|avif|bmp)(\?|#|$)/i;

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/[^/\s]+\/\S*$/i.test(value);
}

/** Whether the URL is plausibly a directly displayable image. */
export function isDirectImageUrl(value: string): boolean {
  if (!isHttpUrl(value)) return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (KONACHAN_HOSTS.has(host) || host.endsWith(".konachan.net")) {
      // Konachan file/preview/data URLs carry no usable extension but are images.
      if (/^\/(image|data|preview|sample)/i.test(parsed.pathname)) return true;
    }
    return IMAGE_EXTENSION.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function parseKonachanPostId(input: string): number | null {
  try {
    const parsed = new URL(input.trim());
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (!KONACHAN_HOSTS.has(host)) return null;
    const match = KONACHAN_POST_PATH.exec(parsed.pathname);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

const KONACHAN_REQUIRED_TAGS = ["order:random", "rating:safe"] as const;
const KONACHAN_TAG = /^[a-z0-9_][a-z0-9_().!?'&+:-]{0,79}$/i;

export function normalizeKonachanTags(input: string): string[] {
  const tags: string[] = [];
  for (const raw of input.trim().toLowerCase().split(/\s+/)) {
    if (!raw || tags.includes(raw) || tags.length >= 6) continue;
    if (KONACHAN_TAG.test(raw) && !raw.includes("order:") && !raw.includes("rating:")) {
      tags.push(raw);
    }
  }
  return tags;
}

export function buildKonachanPostsUrl(extraTags: string[]): string {
  const tags = [...KONACHAN_REQUIRED_TAGS, ...extraTags].join(" ");
  return `https://konachan.net/post.json?tags=${encodeURIComponent(tags)}&limit=1`;
}

export function buildKonachanPostUrl(postId: number): string {
  return `https://konachan.net/post.json?tags=${encodeURIComponent(`id:${postId}`)}&limit=1`;
}

export interface KonachanImage {
  readonly imageUrl: string;
  readonly pageUrl: string;
}

/**
 * Read a Konachan `post.json` payload into a displayable image. Throws a
 * human-readable error when the provider answers without a usable file.
 */
export function konachanImageFromPosts(payload: unknown): KonachanImage {
  if (!Array.isArray(payload) || payload.length === 0 || !isRecord(payload[0])) {
    throw new Error("Konachan returned no wallpapers for those tags.");
  }
  const post = payload[0] as Record<string, unknown>;
  const fileUrl = typeof post.file_url === "string" ? post.file_url : "";
  const id = typeof post.id === "number" && Number.isInteger(post.id) ? post.id : null;
  if (!isHttpUrl(fileUrl) || !fileUrl.startsWith("https://")) {
    throw new Error("Konachan returned a post without a usable image.");
  }
  return {
    imageUrl: fileUrl,
    pageUrl: id !== null ? `https://konachan.net/post/show/${id}` : fileUrl,
  };
}

async function fetchKonachanJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    // Konachan sends no CORS headers, so a browser fetch fails here while a
    // pasted file URL still displays fine. Say so instead of "fetch failed".
    throw new Error(
      "Konachan blocked the API request (no CORS headers). Paste the image URL directly instead.",
    );
  }
  if (!response.ok) throw new Error(`Konachan answered with HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > 1024 * 1024) throw new Error("Konachan answered with too much data.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Konachan answered with invalid data.");
  }
}

export async function fetchRandomKonachanImage(tagsInput: string): Promise<KonachanImage> {
  const posts = await fetchKonachanJson(buildKonachanPostsUrl(normalizeKonachanTags(tagsInput)));
  return konachanImageFromPosts(posts);
}

export async function fetchKonachanPostImage(postId: number): Promise<KonachanImage> {
  const posts = await fetchKonachanJson(buildKonachanPostUrl(postId));
  return konachanImageFromPosts(posts);
}

/**
 * Resolve whatever the user pasted — a direct image URL, a Konachan post
 * page, or a Konachan API URL — into a displayable image URL. Post pages hit
 * the API (which may fail on CORS, see above); everything else is local.
 */
export async function resolveBackgroundImageUrl(input: string): Promise<KonachanImage> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Paste an image URL first.");
  const postId = parseKonachanPostId(trimmed);
  if (postId !== null) return fetchKonachanPostImage(postId);
  if (isDirectImageUrl(trimmed)) return { imageUrl: trimmed, pageUrl: trimmed };
  if (isHttpUrl(trimmed)) {
    throw new Error(
      "That URL does not look like an image. Use a direct file link or a Konachan post link.",
    );
  }
  throw new Error("That is not a valid http(s) URL.");
}

// ── Dithering (Bayer 4×4 ordered + monochrome grain, per palettegen) ─────────

/** Bayer thresholds spread quantization error in a repeating 4×4 pattern. */
export const BAYER_4X4: ReadonlyArray<number> = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
];

/**
 * Quantize RGBA pixels in place: per-channel ordered dithering into `levels`
 * steps, then one monochrome noise sample per pixel. Pure (no canvas), so it
 * is unit-testable; the background layer feeds it ImageData from a canvas.
 *
 * @param grain01 monochrome grain strength, 0 (off) to ~0.12 (30%).
 */
export function ditherImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  levels: number,
  grain01: number,
  seed = 123456789,
): void {
  const steps = Math.max(1, Math.round(levels) - 1);
  const grain = Math.max(0, grain01) * 255;
  let state = seed >>> 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const threshold = (BAYER_4X4[(y % 4) * 4 + (x % 4)]! + 0.5) / 16 - 0.5;
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const noise = (state / 4294967296 - 0.5) * grain;
      for (let channel = 0; channel < 3; channel += 1) {
        const level = Math.max(
          0,
          Math.min(steps, Math.round((data[offset + channel]! / 255) * steps + threshold)),
        );
        data[offset + channel] = (level / steps) * 255 + noise;
      }
    }
  }
}

/** Working size for the dither pass: keeps aspect, caps cost on huge images. */
export function ditherWorkingSize(
  naturalWidth: number,
  naturalHeight: number,
  pixelSize: number,
): { width: number; height: number } {
  const longest = Math.max(naturalWidth, naturalHeight);
  if (!Number.isFinite(longest) || longest <= 0) return { width: 1, height: 1 };
  const scale = Math.min(1, DITHER_MAX_DIMENSION / longest) / Math.max(1, pixelSize);
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

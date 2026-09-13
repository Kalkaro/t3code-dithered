import { useEffect, useRef } from "react";

import { applyBase16ToRoot, ditherImageData, ditherWorkingSize } from "../base16";
import { fetchBackgroundImageBlob } from "../base16Server";
import { BASE16_THEME_ID, ensureBase16ThemeInstalled } from "../base16Theme";
import { useBase16State } from "../hooks/useBase16";
import { useTheme } from "../hooks/useTheme";

/**
 * Owns the Base16 side effects: writes the `--baseXX` variables and
 * background attributes on every state change, and keeps the installed
 * generated theme fresh (repainting when it is the selected theme).
 */
export function Base16AppearanceSync() {
  const state = useBase16State();
  const { refreshTheme, theme } = useTheme();

  useEffect(() => {
    applyBase16ToRoot(document.documentElement, state);
    if (state.enabled && theme === BASE16_THEME_ID) {
      ensureBase16ThemeInstalled(state);
      refreshTheme();
    }
  }, [state, theme, refreshTheme]);

  return null;
}

export interface Base16BackgroundStatus {
  readonly phase: "idle" | "loading" | "ready";
  readonly mode: "dithered" | "plain" | null;
  /** Human-readable reason when showing the original, or the pixel source. */
  readonly detail: string | null;
}

const IDLE_BACKGROUND_STATUS: Base16BackgroundStatus = {
  phase: "idle",
  mode: null,
  detail: null,
};

let backgroundStatus: Base16BackgroundStatus = IDLE_BACKGROUND_STATUS;
const backgroundStatusListeners = new Set<() => void>();

export function getBase16BackgroundStatus(): Base16BackgroundStatus {
  return backgroundStatus;
}

export function subscribeToBase16BackgroundStatus(listener: () => void): () => void {
  backgroundStatusListeners.add(listener);
  return () => {
    backgroundStatusListeners.delete(listener);
  };
}

function setBackgroundStatus(next: Base16BackgroundStatus): void {
  backgroundStatus = next;
  for (const listener of backgroundStatusListeners) listener();
}

function loadImage(url: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = "anonymous";
    const cleanup = () => {
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      resolve(image);
    };
    const handleError = () => {
      cleanup();
      reject(new Error("background image failed to load"));
    };
    image.addEventListener("load", handleLoad);
    image.addEventListener("error", handleError);
    image.src = url;
  });
}

/**
 * Full-viewport custom background behind the app. The image is dithered once per settings change with
 * palettegen's Bayer 4×4 + grain pass. Bytes come through the environment
 * server's `/api/background-image` proxy (like palettegen fetching
 * server-side), so every host dithers — Konachan included. A direct load is
 * the fallback when the proxy is unreachable.
 *
 * The proxy needs the client's environment credential, which an `<img>` tag
 * cannot send (and the desktop renderer is not even same-origin with its
 * server), so the bytes are fetched in JS — bearer token on desktop,
 * session cookies in a same-origin browser — and handed to the canvas as a
 * blob URL, which is always canvas-readable.
 */
export function Base16Background() {
  const state = useBase16State();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const { enabled, background } = state;
  const activeUrl = enabled ? background.imageUrl : "";
  const ditherEnabled = background.ditherEnabled;
  const ditherLevels = background.ditherLevels;
  const ditherGrain = background.ditherGrain;
  const ditherPixelSize = background.ditherPixelSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !activeUrl) return;
    let cancelled = false;

    const showPlain = (source: string) => {
      if (cancelled) return;
      canvas.hidden = true;
      img.hidden = false;
      if (img.getAttribute("src") !== source) img.setAttribute("src", source);
    };

    // Blob URLs are revoked when replaced or when the layer unmounts, never
    // while still displayed (revoking kills the current paint).
    const adoptObjectUrl = (next: string | null) => {
      if (objectUrlRef.current && objectUrlRef.current !== next) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = next;
    };

    const fetchProxiedObjectUrl = async (): Promise<string> => {
      const blob = await fetchBackgroundImageBlob(activeUrl);
      const objectUrl = URL.createObjectURL(blob);
      adoptObjectUrl(objectUrl);
      return objectUrl;
    };

    const report = (status: Base16BackgroundStatus) => {
      if (!cancelled) setBackgroundStatus(status);
    };

    const render = async () => {
      report({ phase: "loading", mode: null, detail: null });
      // Proxied bytes first: the server fetched them, so the canvas stays
      // readable whatever the host's CORS policy is.
      let image: HTMLImageElement | null = null;
      let proxied = false;
      let proxyFailure: string | null = null;
      try {
        image = await loadImage(await fetchProxiedObjectUrl(), false);
        proxied = true;
      } catch (error) {
        image = null;
        proxyFailure = error instanceof Error ? error.message : "proxy unreachable";
      }
      if (cancelled) return;
      if (image === null) {
        // Proxy unreachable or refused: a direct load may still display, but
        // a cross-origin canvas cannot be read back, so dithering is skipped.
        try {
          image = await loadImage(activeUrl, true);
        } catch {
          report({
            phase: "ready",
            mode: "plain",
            detail: `could not load image (${proxyFailure ?? "unknown error"})`,
          });
          showPlain(activeUrl);
          return;
        }
        if (cancelled) return;
      }
      if (!ditherEnabled) {
        report({ phase: "ready", mode: "plain", detail: "dithering is off" });
        showPlain(image.src);
        return;
      }
      try {
        const { width, height } = ditherWorkingSize(
          image.naturalWidth,
          image.naturalHeight,
          ditherPixelSize,
        );
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          report({ phase: "ready", mode: "plain", detail: "canvas unavailable" });
          showPlain(activeUrl);
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        const frame = context.getImageData(0, 0, width, height);
        ditherImageData(frame.data, width, height, ditherLevels, ditherGrain / 100);
        context.putImageData(frame, 0, 0);
        if (cancelled) return;
        img.removeAttribute("src");
        img.hidden = true;
        canvas.hidden = false;
        report({
          phase: "ready",
          mode: "dithered",
          detail: proxied ? "via server proxy" : "via direct load",
        });
      } catch {
        // Canvas is tainted (no CORS): the loaded pixels cannot be read back.
        report({
          phase: "ready",
          mode: "plain",
          detail: proxied ? "pixel read failed" : "host blocks pixel reads (no CORS)",
        });
        showPlain(activeUrl);
      }
    };

    const frame = window.requestAnimationFrame(() => void render());
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [activeUrl, ditherEnabled, ditherLevels, ditherGrain, ditherPixelSize]);

  // Replacement revokes via adoptObjectUrl; this only covers unmount.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    };
  }, []);

  if (!activeUrl) return null;
  return (
    <div id="base16-background" aria-hidden="true">
      <canvas ref={canvasRef} hidden />
      {/* No alt text: purely decorative, the page content carries meaning. */}
      <img ref={imgRef} alt="" hidden draggable={false} />
    </div>
  );
}

import { BASE16_KEYS, normalizeHexColor, type Base16Palette } from "./base16";
import { resolvePrimaryEnvironmentHttpUrl } from "./environments/primary";
import { readDesktopPrimaryBearerToken } from "./environments/primary/desktopAuth";

async function environmentFetch(path: string, query: Record<string, string>): Promise<Response> {
  const url = resolvePrimaryEnvironmentHttpUrl(path, query);
  const isDesktop = window.desktopBridge !== undefined;
  const headers: Record<string, string> = {};
  if (isDesktop) {
    const bearerToken = await readDesktopPrimaryBearerToken();
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  }
  return fetch(
    url,
    isDesktop ? { headers, credentials: "omit" } : { headers, credentials: "include" },
  );
}

export async function fetchBackgroundImageBlob(imageUrl: string): Promise<Blob> {
  const response = await environmentFetch("/api/background-image", { url: imageUrl });
  if (!response.ok) throw new Error(`proxy HTTP ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("proxy returned no image");
  return blob;
}

export async function generateBase16Palette(
  imageUrl: string,
  polarity: "dark" | "light",
): Promise<Base16Palette> {
  const response = await environmentFetch("/api/background-palette", {
    url: imageUrl,
    polarity,
  });
  if (!response.ok) {
    const message = (await response.text()).trim();
    throw new Error(message || `Pywal generation failed (HTTP ${response.status}).`);
  }
  const payload = (await response.json()) as unknown;
  if (typeof payload !== "object" || payload === null || !("palette" in payload)) {
    throw new Error("The environment returned an invalid Pywal palette.");
  }
  const rawPalette = (payload as { readonly palette?: unknown }).palette;
  if (typeof rawPalette !== "object" || rawPalette === null) {
    throw new Error("The environment returned an invalid Pywal palette.");
  }
  const palette = {} as Base16Palette;
  for (const key of BASE16_KEYS) {
    const raw = (rawPalette as Record<string, unknown>)[key];
    const normalized = typeof raw === "string" ? normalizeHexColor(raw) : null;
    if (normalized === null) {
      throw new Error("The environment returned an incomplete Pywal palette.");
    }
    palette[key] = normalized;
  }
  return palette;
}

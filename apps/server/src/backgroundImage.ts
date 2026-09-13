import * as NodeDnsPromises from "node:dns/promises";
import * as NodeNet from "node:net";
import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import {
  HttpClient,
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
} from "effect/unstable/http";

import { authenticateRawRouteWithScope } from "./http.ts";

export const BACKGROUND_IMAGE_ROUTE_PATH = "/api/background-image";
export const BACKGROUND_PALETTE_ROUTE_PATH = "/api/background-palette";
const MAX_IMAGE_URL_LENGTH = 2048;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const PYWAL_TIMEOUT_MS = 30_000;
const decodeUnknownJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

const PYWAL_BASE16_PATHS = {
  base00: ["colors", "color0"],
  base01: ["colors", "color0"],
  base02: ["colors", "color8"],
  base03: ["colors", "color8"],
  base04: ["colors", "color7"],
  base05: ["special", "foreground"],
  base06: ["colors", "color15"],
  base07: ["colors", "color15"],
  base08: ["colors", "color1"],
  base09: ["colors", "color9"],
  base0A: ["colors", "color3"],
  base0B: ["colors", "color2"],
  base0C: ["colors", "color6"],
  base0D: ["colors", "color4"],
  base0E: ["colors", "color5"],
  base0F: ["colors", "color13"],
} as const;

export type GeneratedBase16Palette = Record<keyof typeof PYWAL_BASE16_PATHS, string>;

export function pywalArguments(
  polarity: "dark" | "light",
  wallpaper: string,
  outputDirectory: string,
): ReadonlyArray<string> {
  return [
    "--cols16",
    "--contrast",
    "1.5",
    "-i",
    wallpaper,
    "--out-dir",
    outputDirectory,
    ...(polarity === "light" ? ["-l"] : []),
    "-n",
    "-s",
    "-t",
    "-e",
    "-q",
  ];
}

function nestedString(payload: unknown, section: string, key: string): string | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const parent = (payload as Record<string, unknown>)[section];
  if (typeof parent !== "object" || parent === null || Array.isArray(parent)) return null;
  const value = (parent as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

/** Map Pywal16's terminal colors onto the same Base16 roles as palettegen. */
export function pywalPalette(payload: unknown): GeneratedBase16Palette | null {
  const palette = {} as GeneratedBase16Palette;
  for (const [base16Key, [section, colorKey]] of Object.entries(PYWAL_BASE16_PATHS)) {
    const value = nestedString(payload, section, colorKey)?.replace(/^#/, "").toLowerCase();
    if (!value || !/^[0-9a-f]{6}$/.test(value)) return null;
    palette[base16Key as keyof GeneratedBase16Palette] = `#${value}`;
  }
  return palette;
}

export class BackgroundImageError extends Schema.TaggedError<BackgroundImageError>()(
  "BackgroundImageError",
  {
    status: Schema.Number,
    message: Schema.String,
  },
) {}

const isBackgroundImageError = Schema.is(BackgroundImageError);

const backgroundImageFailure = (
  status: number,
  message: string,
): Effect.Effect<never, BackgroundImageError> =>
  Effect.fail(new BackgroundImageError({ status, message }));

function v4InSubnet(bytes: readonly number[], base: readonly number[], prefix: number): boolean {
  const fullBytes = Math.floor(prefix / 8);
  const restBits = prefix % 8;
  for (let index = 0; index < fullBytes; index += 1) {
    if (bytes[index] !== base[index]) return false;
  }
  if (restBits === 0) return true;
  const mask = (0xff << (8 - restBits)) & 0xff;
  return (bytes[fullBytes]! & mask) === (base[fullBytes]! & mask);
}

// IPv4 ranges that are never a public image host (RFC 1918, loopback,
// link-local, multicast, documentation, CGNAT, …).
const V4_NON_GLOBAL: ReadonlyArray<{ readonly base: readonly number[]; readonly prefix: number }> =
  [
    { base: [0, 0, 0, 0], prefix: 8 },
    { base: [10, 0, 0, 0], prefix: 8 },
    { base: [100, 64, 0, 0], prefix: 10 },
    { base: [127, 0, 0, 0], prefix: 8 },
    { base: [169, 254, 0, 0], prefix: 16 },
    { base: [172, 16, 0, 0], prefix: 12 },
    { base: [192, 0, 0, 0], prefix: 24 },
    { base: [192, 0, 2, 0], prefix: 24 },
    { base: [192, 88, 99, 0], prefix: 24 },
    { base: [192, 168, 0, 0], prefix: 16 },
    { base: [198, 18, 0, 0], prefix: 15 },
    { base: [198, 51, 100, 0], prefix: 24 },
    { base: [203, 0, 113, 0], prefix: 24 },
    { base: [224, 0, 0, 0], prefix: 4 },
    { base: [240, 0, 0, 0], prefix: 4 },
  ];

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return null;
    const byte = Number(part);
    if (byte > 255) return null;
    bytes.push(byte);
  }
  return bytes;
}

/** Expand an IPv6 literal (with optional `::` and embedded IPv4) to 16 bytes. */
export function parseIpv6(address: string): number[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const parseGroup = (group: string): number[] | null => {
    if (group === "") return [];
    const bytes: number[] = [];
    for (const piece of group.split(":")) {
      if (piece.includes(".")) {
        const v4 = parseIpv4(piece);
        if (v4 === null) return null;
        bytes.push(...v4);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
        const value = Number.parseInt(piece, 16);
        bytes.push((value >> 8) & 0xff, value & 0xff);
      }
    }
    return bytes;
  };
  const head = parseGroup(halves[0] ?? "");
  const tail = halves.length === 2 ? parseGroup(halves[1] ?? "") : [];
  if (head === null || tail === null) return null;
  if (halves.length === 1) return head.length === 16 ? head : null;
  const missing = 16 - head.length - tail.length;
  if (missing < 0) return null;
  return [...head, ...Array.from({ length: missing }, () => 0), ...tail];
}

function v6InSubnet(bytes: readonly number[], base: readonly number[], prefix: number): boolean {
  const fullBytes = Math.floor(prefix / 8);
  const restBits = prefix % 8;
  for (let index = 0; index < fullBytes; index += 1) {
    if (bytes[index] !== base[index]) return false;
  }
  if (restBits === 0) return true;
  const mask = (0xff << (8 - restBits)) & 0xff;
  return (bytes[fullBytes]! & mask) === (base[fullBytes]! & mask);
}

const IPV4_MAPPED_PREFIX = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0, 0, 0] as const;

const V6_NON_GLOBAL: ReadonlyArray<{ readonly base: readonly number[]; readonly prefix: number }> =
  [
    { base: Array.from({ length: 16 }, () => 0), prefix: 128 },
    { base: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], prefix: 128 },
    { base: [...IPV4_MAPPED_PREFIX], prefix: 96 },
    { base: [0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 96 },
    { base: [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 32 },
    { base: [0xfc, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 7 },
    { base: [0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 10 },
    { base: [0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prefix: 8 },
  ];

/**
 * Whether a literal IP address is globally routable. The proxy only fetches
 * from public addresses, so a crafted link cannot probe the host's LAN,
 * cloud metadata endpoints, or the server itself.
 */
export function isGlobalUnicastIp(address: string): boolean {
  const family = NodeNet.isIP(address);
  if (family === 4) {
    const bytes = parseIpv4(address);
    if (bytes === null) return false;
    return !V4_NON_GLOBAL.some(({ base, prefix }) => v4InSubnet(bytes, base, prefix));
  }
  if (family === 6) {
    const bytes = parseIpv6(address.toLowerCase());
    if (bytes === null) return false;
    // IPv4-mapped IPv6 carries the v4 verdict.
    if (v6InSubnet(bytes, IPV4_MAPPED_PREFIX, 96)) {
      return isGlobalUnicastIp(bytes.slice(12).join("."));
    }
    return !V6_NON_GLOBAL.some(({ base, prefix }) => v6InSubnet(bytes, base, prefix));
  }
  return false;
}

export interface ValidBackgroundImageUrl {
  readonly url: string;
  readonly host: string;
}

/** Parse and policy-check a user-supplied image URL. Null when rejected. */
export function validateBackgroundImageUrl(input: string): ValidBackgroundImageUrl | null {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_IMAGE_URL_LENGTH) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    return null;
  }
  // URL keeps IPv6 literals bracketed; strip them so the IP check sees `::1`.
  const host = parsed.hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
  if (host === "") return null;
  if (NodeNet.isIP(host) !== 0 && !isGlobalUnicastIp(host)) return null;
  if (parsed.port !== "" && parsed.port !== "443") return null;
  return { url: parsed.toString(), host };
}

const resolvePublicAddresses = Effect.fn("backgroundImage.resolvePublicAddresses")(function* (
  hostname: string,
) {
  const records = yield* Effect.tryPromise({
    try: () => NodeDnsPromises.lookup(hostname, { all: true }),
    catch: () =>
      new BackgroundImageError({ status: 502, message: "Image host could not be resolved." }),
  });
  if (records.length === 0 || !records.every((record) => isGlobalUnicastIp(record.address))) {
    return yield* backgroundImageFailure(400, "Image host is not a public address.");
  }
});

const fetchBackgroundImage = Effect.fn("backgroundImage.fetch")(function* (
  target: ValidBackgroundImageUrl,
) {
  yield* resolvePublicAddresses(target.host);

  const httpClient = yield* HttpClient.HttpClient;
  const response = yield* httpClient.get(target.url).pipe(
    Effect.timeoutOption(FETCH_TIMEOUT_MS),
    Effect.mapError(
      () => new BackgroundImageError({ status: 502, message: "Could not fetch the image." }),
    ),
  );
  if (Option.isNone(response)) {
    return yield* backgroundImageFailure(504, "Image fetch timed out.");
  }
  const upstream = response.value;
  if (upstream.status !== 200) {
    return yield* backgroundImageFailure(502, `Image server returned HTTP ${upstream.status}.`);
  }

  // Redirects are followed by the client; re-check the host that answered.
  const finalHost = yield* Effect.try({
    try: () => new URL(upstream.request.url).hostname.toLowerCase().replace(/\.$/, ""),
    catch: () =>
      new BackgroundImageError({
        status: 502,
        message: "Image server redirected to an invalid URL.",
      }),
  });
  if (finalHost !== target.host) yield* resolvePublicAddresses(finalHost);

  const contentType =
    String(upstream.headers["content-type"] ?? "")
      .split(";", 1)[0]
      ?.trim()
      .toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) {
    return yield* backgroundImageFailure(400, "That URL did not return an image.");
  }
  const declaredLength = Number(String(upstream.headers["content-length"] ?? ""));
  if (Number.isInteger(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    return yield* backgroundImageFailure(413, "Image exceeds the 25 MB limit.");
  }

  const chunks: Array<Uint8Array> = [];
  let totalBytes = 0;
  yield* upstream.stream.pipe(
    Stream.runForEach((chunk) =>
      Effect.gen(function* () {
        totalBytes += chunk.length;
        if (totalBytes > MAX_IMAGE_BYTES) {
          return yield* backgroundImageFailure(413, "Image exceeds the 25 MB limit.");
        }
        chunks.push(chunk);
      }),
    ),
    Effect.mapError((cause) =>
      isBackgroundImageError(cause)
        ? cause
        : new BackgroundImageError({ status: 502, message: "Image download was interrupted." }),
    ),
  );

  const body = Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)),
  );
  return { body, contentType } as const;
});

const generateBackgroundPalette = Effect.fn("backgroundImage.generatePalette")(
  function* (
    image: { readonly body: Buffer; readonly contentType: string },
    polarity: "dark" | "light",
  ) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const processSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const temporaryDirectory = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "t3code-pywal-",
    });
    const extension =
      image.contentType === "image/png"
        ? ".png"
        : image.contentType === "image/webp"
          ? ".webp"
          : ".jpg";
    const wallpaper = path.join(temporaryDirectory, `wallpaper${extension}`);
    const outputDirectory = path.join(temporaryDirectory, "output");
    const configDirectory = path.join(temporaryDirectory, "config");
    const cacheDirectory = path.join(temporaryDirectory, "cache");
    yield* Effect.all(
      [
        fileSystem.writeFile(wallpaper, image.body, { mode: 0o600 }),
        fileSystem.makeDirectory(outputDirectory, { mode: 0o700 }),
        fileSystem.makeDirectory(configDirectory, { mode: 0o700 }),
        fileSystem.makeDirectory(cacheDirectory, { mode: 0o700 }),
      ],
      { concurrency: "unbounded" },
    );
    const exitCode = yield* processSpawner
      .exitCode(
        ChildProcess.make(
          process.env.PALETTE_PYWAL?.trim() || "wal",
          pywalArguments(polarity, wallpaper, outputDirectory),
          {
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
            env: {
              ...process.env,
              HOME: temporaryDirectory,
              XDG_CONFIG_HOME: configDirectory,
              PYWAL_CACHE_DIR: cacheDirectory,
              NO_FUN: "1",
            },
          },
        ),
      )
      .pipe(Effect.timeout(PYWAL_TIMEOUT_MS));
    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* backgroundImageFailure(502, "Pywal palette generation failed.");
    }
    const colors = yield* fileSystem
      .readFileString(path.join(outputDirectory, "colors.json"))
      .pipe(Effect.flatMap(decodeUnknownJson));
    const palette = pywalPalette(colors);
    if (palette === null) {
      return yield* backgroundImageFailure(502, "Pywal returned incomplete color data.");
    }
    return palette;
  },
  Effect.scoped,
  Effect.mapError((cause) =>
    isBackgroundImageError(cause)
      ? cause
      : new BackgroundImageError({
          status: 502,
          message: "Pywal16 could not generate a palette on this environment.",
        }),
  ),
);

export const backgroundImageRouteLayer = HttpRouter.add(
  "GET",
  BACKGROUND_IMAGE_ROUTE_PATH,
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const validated = validateBackgroundImageUrl(url.value.searchParams.get("url") ?? "");
    if (validated === null) {
      return HttpServerResponse.text("Image URL must be a public https:// URL.", { status: 400 });
    }
    return yield* fetchBackgroundImage(validated).pipe(
      Effect.map(({ body, contentType }) =>
        HttpServerResponse.uint8Array(body, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        }),
      ),
      Effect.catch((error) =>
        Effect.succeed(HttpServerResponse.text(error.message, { status: error.status })),
      ),
    );
  }).pipe(
    Effect.catchTags({
      EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
      EnvironmentInternalError: HttpServerRespondable.toResponse,
      EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
    }),
  ),
);

export const backgroundPaletteRouteLayer = HttpRouter.add(
  "GET",
  BACKGROUND_PALETTE_ROUTE_PATH,
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) return HttpServerResponse.text("Bad Request", { status: 400 });
    const validated = validateBackgroundImageUrl(url.value.searchParams.get("url") ?? "");
    if (validated === null) {
      return HttpServerResponse.text("Image URL must be a public https:// URL.", { status: 400 });
    }
    const polarity = url.value.searchParams.get("polarity");
    if (polarity !== "dark" && polarity !== "light") {
      return HttpServerResponse.text("Palette polarity must be dark or light.", { status: 400 });
    }
    return yield* fetchBackgroundImage(validated).pipe(
      Effect.flatMap((image) => generateBackgroundPalette(image, polarity)),
      Effect.map((palette) => HttpServerResponse.jsonUnsafe({ palette })),
      Effect.catch((error) =>
        Effect.succeed(HttpServerResponse.text(error.message, { status: error.status })),
      ),
    );
  }).pipe(
    Effect.catchTags({
      EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
      EnvironmentInternalError: HttpServerRespondable.toResponse,
      EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
    }),
  ),
);

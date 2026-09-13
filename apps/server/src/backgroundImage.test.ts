import { describe, expect, it } from "vite-plus/test";

import {
  isGlobalUnicastIp,
  parseIpv6,
  pywalArguments,
  pywalPalette,
  validateBackgroundImageUrl,
} from "./backgroundImage.ts";

describe("isGlobalUnicastIp", () => {
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2001:4860:4860::8888", "2606:4700:4700::1111"])(
    "treats %s as public",
    (address) => {
      expect(isGlobalUnicastIp(address)).toBe(true);
    },
  );

  it.each([
    "10.0.0.1",
    "172.16.4.9",
    "172.31.255.255",
    "192.168.1.1",
    "127.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "192.0.2.1",
    "198.51.100.7",
    "203.0.113.9",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:10.1.2.3",
    "not-an-ip",
    "",
  ])("rejects %s", (address) => {
    expect(isGlobalUnicastIp(address)).toBe(false);
  });
});

describe("parseIpv6", () => {
  it("expands compressed and embedded forms", () => {
    expect(parseIpv6("::1")).toHaveLength(16);
    expect(parseIpv6("2001:db8::1")?.slice(14)).toEqual([0, 1]);
    expect(parseIpv6("::ffff:192.0.2.1")?.slice(12)).toEqual([192, 0, 2, 1]);
    expect(parseIpv6("1:2:3:4:5:6:7:8")).toHaveLength(16);
  });

  it("rejects malformed literals", () => {
    expect(parseIpv6("1::2::3")).toBeNull();
    expect(parseIpv6("12345::")).toBeNull();
    expect(parseIpv6("1:2:3:4:5:6:7")).toBeNull();
  });
});

describe("validateBackgroundImageUrl", () => {
  it("accepts public https image URLs", () => {
    expect(validateBackgroundImageUrl("https://konachan.net/image/a/b.png")).toEqual({
      url: "https://konachan.net/image/a/b.png",
      host: "konachan.net",
    });
  });

  it.each([
    "",
    "not a url",
    "http://example.com/a.png",
    "ftp://example.com/a.png",
    "https://user:pass@example.com/a.png",
    "https://127.0.0.1/a.png",
    "https://10.0.0.1/a.png",
    "https://[::1]/a.png",
    "https://example.com:8080/a.png",
    `https://example.com/${"a".repeat(2048)}`,
  ])("rejects %s", (input) => {
    expect(validateBackgroundImageUrl(input)).toBeNull();
  });
});

describe("Pywal Base16 generation", () => {
  it("uses palettegen's Pywal16 flags", () => {
    expect(pywalArguments("dark", "/tmp/wallpaper.jpg", "/tmp/output")).toEqual([
      "--cols16",
      "--contrast",
      "1.5",
      "-i",
      "/tmp/wallpaper.jpg",
      "--out-dir",
      "/tmp/output",
      "-n",
      "-s",
      "-t",
      "-e",
      "-q",
    ]);
    expect(pywalArguments("light", "/tmp/wallpaper.jpg", "/tmp/output")).toContain("-l");
  });

  it("maps Pywal terminal colors to palettegen's Base16 roles", () => {
    const colors = Object.fromEntries(
      Array.from({ length: 16 }, (_, index) => [
        `color${index}`,
        `#${index.toString(16).repeat(6)}`,
      ]),
    );
    expect(pywalPalette({ colors, special: { foreground: "#555555" } })).toEqual({
      base00: "#000000",
      base01: "#000000",
      base02: "#888888",
      base03: "#888888",
      base04: "#777777",
      base05: "#555555",
      base06: "#ffffff",
      base07: "#ffffff",
      base08: "#111111",
      base09: "#999999",
      base0A: "#333333",
      base0B: "#222222",
      base0C: "#666666",
      base0D: "#444444",
      base0E: "#555555",
      base0F: "#dddddd",
    });
    expect(pywalPalette({ colors: {}, special: {} })).toBeNull();
  });
});

import type { BridgePlatform } from "./types.ts";

export function detectPlatform(
  userAgent: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
): BridgePlatform | null {
  if (userAgent.includes("Android") || userAgent.includes("Adr")) {
    return "android";
  }

  // Mirrors the existing WebView detection used in production H5 pages.
  if (/\(i[^;]+;( U;)? CPU.+Mac OS X/.test(userAgent)) {
    return "ios";
  }

  return null;
}

export function isAndroid(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): boolean {
  return ua.includes('Android') || ua.includes('Adr')
}

/** Mirrors the existing WebView detection used in production H5 pages. */
export function isIOS(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): boolean {
  return /\(i[^;]+;( U;)? CPU.+Mac OS X/.test(ua)
}

/**
 * Whether this environment is worth waiting on for a native bridge.
 *
 * - Android / iOS UA → `true` even if the native object is not injected yet
 * - Otherwise → `false`
 *
 * Does not start waiting and does not mean `send`/`request` are usable yet.
 * Use {@link onBridgeReady} to obtain a ready bridge.
 */
export function isSupportBridge(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): boolean {
  return isAndroid(ua) || isIOS(ua)
}

import type { NativeCall } from '../types.ts'

/**
 * Registration point for `@vois/webview-bridge/debug`.
 *
 * Lives outside `src/debug/` so the always-loaded bridge can ask about it: this
 * module costs a few bytes in every build, while the login and its credential stay
 * in the debug entry that only a debug import pulls in.
 */
let factory: (() => NativeCall) | null = null

/**
 * @internal called by `enableDebugBridge`.
 *
 * Must happen before anything awaits a bridge. The factory is synchronous: the
 * `NativeCall` it returns is usable immediately, and its page-param reads never log
 * in (the fixed-account login is an explicit `getDebugAccessToken` call). A desktop
 * page that starts waiting before the debug entry is imported finds no transport
 * here and stops — which is why the app registers lazily rather than at import.
 */
export function setDebugBridge(next: () => NativeCall): void {
  factory = next
}

/** Whether a debug entry was imported in this page. */
export function isDebugBridgeEnabled(): boolean {
  return factory !== null
}

/** @internal used by `startWaiting`; `null` when no debug entry was imported. */
export function getDebugBridge(): NativeCall | null {
  return factory ? factory() : null
}

/** @internal test helper — forget the registered debug entry between tests. */
export function resetDebugBridge(): void {
  factory = null
}

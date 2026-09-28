import type { NativeCall } from '../types.ts'

/**
 * Registration point for `@vois/webview-bridge/debug`.
 *
 * Lives outside `src/debug/` so the always-loaded bridge can ask about it: this
 * module costs a few bytes in every build, while the login and its credential stay
 * in the debug entry that only a debug import pulls in.
 */
let factory: (() => Promise<NativeCall>) | null = null

/**
 * @internal called by `enableDebugBridge`.
 *
 * Must happen before anything awaits a bridge. The wait starts on the first
 * `onBridgeReady`, and a desktop page that starts it earlier finds no transport
 * here and stops — which is why the app registers lazily rather than at import.
 */
export function setDebugBridge(next: () => Promise<NativeCall>): void {
  factory = next
}

/** Whether a debug entry was imported in this page. */
export function isDebugBridgeEnabled(): boolean {
  return factory !== null
}

/** @internal used by `startWaiting`; `null` when no debug entry was imported. */
export function getDebugBridge(): Promise<NativeCall> | null {
  return factory ? factory() : null
}

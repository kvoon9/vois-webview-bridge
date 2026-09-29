import { setDebugBridge } from '../bridge/debug.ts'
import { createDebugLoginGetter, createLocalBridge } from './bridge.ts'
import type { DebugCredentials, DebugLogin } from './login.ts'

/**
 * The account `getDebugAccessToken` falls back to when the caller does not supply
 * one.
 *
 * Fixed on purpose: a debug session must not need a file, a server, or Node. That
 * puts the password in this package, so it ships wherever the package goes — keep
 * it a throwaway account if that matters, and change it in this one place.
 */
const DEFAULT_CREDENTIALS: DebugCredentials = {
  account: '16675441248',
  password: '30215594',
  countryCode: '86',
}

/** Credentials for the explicit fallback; `enableDebugBridge` can replace them. */
let fallbackCredentials: DebugCredentials = DEFAULT_CREDENTIALS

/** Session getter shared by every `getDebugAccessToken` call. */
let fallbackLogin: (() => Promise<DebugLogin>) | null = null

/**
 * Log in with the fixed debug account and resolve its access token.
 *
 * This is the explicit fallback for dev and debug-preview pages only. Page
 * parameters never trigger a login, so a page first reads the token from
 * `get-page-params` and calls this only when that source had none. Callers keep the
 * fallback behind their own debug gate.
 *
 * Concurrent calls share one login, a success is kept for the page's life, and a
 * failure is forgotten so the next call retries.
 */
export function getDebugAccessToken(): Promise<string> {
  fallbackLogin ??= createDebugLoginGetter(fallbackCredentials)
  return fallbackLogin().then((login) => login.token)
}

/**
 * Make `onBridgeReady` resolve without a native side, by answering
 * `get-page-params` exactly as native would.
 *
 * The bridge is handed over immediately and its page-param reads never log in:
 * they serve static debug environment params (plus any params the local bridge was
 * constructed with). `credentials` configures the explicit fallback used by
 * {@link getDebugAccessToken}.
 *
 * Call it at boot when the page is served by a debug server:
 *
 * ```ts
 * import { enableDebugBridge } from '@vois/webview-bridge/debug'
 *
 * if (isWebviewDebug()) enableDebugBridge()
 * ```
 *
 * The resulting bridge answers for the page's life.
 */
export function enableDebugBridge(credentials: DebugCredentials = DEFAULT_CREDENTIALS): void {
  fallbackCredentials = credentials
  fallbackLogin = createDebugLoginGetter(credentials)
  setDebugBridge(() => createLocalBridge())
}

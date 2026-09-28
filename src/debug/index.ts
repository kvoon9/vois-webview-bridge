import { setDebugBridge } from '../bridge/debug.ts'
import { createLocalBridge } from './bridge.ts'
import { loginForToken, type DebugCredentials } from './login.ts'

/**
 * The account the debug bridge logs in as when the caller does not supply one.
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

/**
 * Make `onBridgeReady` resolve without a native side, by logging in and answering
 * `get-page-params` exactly as native would.
 *
 * Call it at boot when the page is served by a debug server:
 *
 * ```ts
 * import { enableDebugBridge } from '@vois/webview-bridge/debug'
 *
 * if (isWebviewDebug()) enableDebugBridge()
 * ```
 *
 * The login runs on the first `onBridgeReady`, so a page that never asks for the
 * bridge never pays for it. The resulting bridge answers for the page's life.
 */
export function enableDebugBridge(credentials: DebugCredentials = DEFAULT_CREDENTIALS): void {
  setDebugBridge(async () => createLocalBridge(await loginForToken(credentials)))
}

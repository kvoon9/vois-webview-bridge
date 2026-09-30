import { setDebugBridge } from '../bridge/debug.ts'
import { DEBUG_ACCESS_TOKEN_PATH, DEBUG_LOGIN_PATH } from './access-token-path.ts'
import { createDebugLoginGetter, createLocalBridge, setDebugPageParams } from './bridge.ts'
import { DEFAULT_DEBUG_CREDENTIALS } from './credentials.ts'
import type { DebugCredentials, DebugLogin } from './login.ts'

/** Credentials for the explicit fallback; `enableDebugBridge` can replace them. */
let fallbackCredentials: DebugCredentials = DEFAULT_DEBUG_CREDENTIALS

/** Session getter shared by every `getDebugAccessToken` call. */
let fallbackLogin: (() => Promise<DebugLogin>) | null = null

/**
 * Read the token a debug server minted (see `@vois/webview-bridge/vite`).
 *
 * The login below speaks the WebSocket gateway, whose tokens the `/v1` and `/v2`
 * HTTP APIs reject with `31 授权失效`; the app signs in on the TCP gateway its API
 * hands out, and only Node can open that socket. A server mounting `voisBridgeAuth`
 * mints one there, so every call here reads a current token. No plugin, or a failed
 * fetch, leaves the account login in charge.
 */
async function readServerToken(): Promise<string | null> {
  try {
    const response = await fetch(DEBUG_ACCESS_TOKEN_PATH, {
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return null
    const body = (await response.json()) as { token?: unknown }
    return typeof body.token === 'string' && body.token.length > 0 ? body.token : null
  } catch {
    return null
  }
}

/**
 * Resolve the access token this debug session should use.
 *
 * This is the explicit fallback for dev and debug-preview pages only. Page
 * parameters never trigger it, so a page first reads the token from
 * `get-page-params` and calls this only when that source had none. Callers keep the
 * fallback behind their own debug gate.
 *
 * A debug server's minted token wins; the fixed-account login is what a browser with
 * no such server has left. Concurrent calls share one login, a success is kept for
 * the page's life, and a failure is forgotten so the next call retries.
 */
export async function getDebugAccessToken(): Promise<string> {
  const served = await readServerToken()
  if (served) return served
  fallbackLogin ??= createDebugLoginGetter(fallbackCredentials)
  return fallbackLogin().then((login) => login.token)
}

/**
 * Sign in with caller-supplied credentials through the debug server.
 *
 * The browser cannot mint a token the `/v2` APIs accept (see `getDebugAccessToken`),
 * so the pair is posted to the server, which signs in on the TCP gateway and
 * adopts the account: every later `getDebugAccessToken` reads that session's
 * token, and `get-page-params` starts answering the account's `login-id`. The
 * response carries the server's error message verbatim (账号或密码错误， …).
 */
export async function loginWithCredentials(credentials: DebugCredentials): Promise<DebugLogin> {
  const response = await fetch(DEBUG_LOGIN_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })
  const body = (await response.json().catch(() => null)) as {
    token?: unknown
    userId?: unknown
    error?: unknown
  } | null
  if (!response.ok || typeof body?.token !== 'string' || body.token === '') {
    throw new Error(
      typeof body?.error === 'string' && body.error !== ''
        ? body.error
        : `登录失败 (HTTP ${response.status})`,
    )
  }
  const login: DebugLogin = {
    token: body.token,
    userId: typeof body.userId === 'number' ? body.userId : undefined,
  }
  // Native answers `login-id` with exactly this id, and pages key on it; adopting
  // it here keeps every later page-param read correct without URL surgery.
  if (login.userId !== undefined) setDebugPageParams({ 'login-id': String(login.userId) })
  return login
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
export function enableDebugBridge(credentials: DebugCredentials = DEFAULT_DEBUG_CREDENTIALS): void {
  fallbackCredentials = credentials
  fallbackLogin = createDebugLoginGetter(credentials)
  setDebugBridge(() => createLocalBridge())
}

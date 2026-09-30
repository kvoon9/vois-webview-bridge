import { setDebugBridge } from '../bridge/debug.ts'
import { DEBUG_ACCESS_TOKEN_PATH, DEBUG_LOGIN_PATH } from './access-token-path.ts'
import { createDebugLoginGetter, createLocalBridge, setDebugPageParams } from './bridge.ts'
import { DEFAULT_DEBUG_CREDENTIALS } from './credentials.ts'
import type { DebugCredentials, DebugLogin } from './login.ts'

/** Credentials for the explicit fallback; `enableDebugBridge` can replace them. */
let fallbackCredentials: DebugCredentials = DEFAULT_DEBUG_CREDENTIALS

/** Session getter shared by every `getDebugAccessToken` call. */
let fallbackLogin: (() => Promise<DebugLogin>) | null = null

/** The account a debug server signed in as: the token plus the id native calls `login-id`. */
interface ServedSession {
  token: string
  userId?: number
}

/**
 * Read the token a debug server minted (see `@vois/webview-bridge/vite`), freshly
 * every time: the server re-mints (TTL, dropped socket) and only it knows when.
 *
 * The login below speaks the WebSocket gateway, whose tokens the `/v1` and `/v2`
 * HTTP APIs reject with `31 授权失效`; the app signs in on the TCP gateway its API
 * hands out, and only Node can open that socket. A server mounting `voisBridgeAuth`
 * mints one there, so every call here reads a current token. No plugin, or a failed
 * fetch, leaves the account login in charge.
 */
async function readServedSession(): Promise<ServedSession | null> {
  try {
    const response = await fetch(DEBUG_ACCESS_TOKEN_PATH, {
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return null
    const body = (await response.json()) as { token?: unknown; userId?: unknown }
    if (typeof body.token !== 'string' || body.token.length === 0) return null
    return {
      token: body.token,
      userId: typeof body.userId === 'number' ? body.userId : undefined,
    }
  } catch {
    return null
  }
}

/**
 * The session as page-param reads see it: read once per page. A page-param read
 * happens milliseconds after boot, so the identity behind the token cannot be
 * re-fetched per read; a login inside the page refreshes this cache instead.
 */
let sessionForParams: Promise<ServedSession | null> | null = null

function servedSessionForParams(): Promise<ServedSession | null> {
  return (sessionForParams ??= readServedSession())
}

/** The session's account as page params, or empty when there is no session. */
async function servedSessionParams(): Promise<Record<string, string>> {
  const session = await servedSessionForParams()
  return session?.userId === undefined ? {} : { 'login-id': String(session.userId) }
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
  const served = await readServedSession()
  if (served) return served.token
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
  if (login.userId !== undefined) {
    setDebugPageParams({ 'login-id': String(login.userId) })
    // The page-param cache predates this login, so it still holds the old account.
    sessionForParams = Promise.resolve({ token: login.token, userId: login.userId })
  }
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
  // A fresh registration starts a fresh session read; the cached one answered for
  // whatever was signed in at the time.
  sessionForParams = null
  // The session is the server's, so the page asks it who it is; without a debug
  // server the source comes back empty and the pool alone answers.
  setDebugBridge(() => createLocalBridge({}, servedSessionParams))
}

import type { NativeCall } from '../types.ts'
import { loginForToken, type DebugCredentials, type DebugLogin } from './login.ts'

/** Environment params a debug session reports without any login. */
const STATIC_PARAMS: Record<string, string> = {
  'device-type': 'debug',
  theme: 'light',
  lang: 'zh-CN',
}

/**
 * Lazy login session for the explicit debug fallback.
 *
 * One in-flight login is shared by all callers, a successful result is kept for the
 * page's life, and a failed promise is forgotten so the next call retries.
 *
 * `login` is injectable purely so tests can exercise those transitions without a
 * WebSocket.
 */
export function createDebugLoginGetter(
  credentials: DebugCredentials,
  login: (credentials: DebugCredentials) => Promise<DebugLogin> = loginForToken,
): () => Promise<DebugLogin> {
  let session: Promise<DebugLogin> | null = null

  return () => {
    session ??= login(credentials).catch((error: unknown) => {
      session = null
      throw error
    })
    return session
  }
}

function pick(pool: Record<string, string>, names: string[]): Record<string, string> {
  return Object.fromEntries(names.filter((name) => name in pool).map((name) => [name, pool[name]]))
}

/**
 * A `NativeCall` backed by static params instead of a WebView, so the page cannot
 * tell the difference: `get-page-params` answers exactly what native would, and
 * anything else is a no-op rather than an error.
 *
 * It never logs in. Page-param reads serve the debug environment defaults plus any
 * explicitly supplied params (a token dropped in there is preserved, which lets
 * tests pin the native-first source), while the fixed-account login is reached only
 * through `getDebugAccessToken`.
 *
 * Unknown protocols are ignored on purpose. A debug session has no native side to
 * close a page or start a payment, and throwing would turn a page's normal flow
 * into a crash.
 */
export function createLocalBridge(pageParams: Record<string, string> = {}): NativeCall {
  const pool: Record<string, string> = { ...STATIC_PARAMS, ...pageParams }

  return (type, data, onResponse) => {
    if (type !== 'get-page-params') return onResponse?.('{"errcode":0,"errmsg":"","data":{}}')

    const respond = onResponse
    if (!respond) return

    // Native answers everything when no names are given, and filters when they are.
    const asked = (data as { params?: unknown })?.params
    const names = Array.isArray(asked)
      ? asked.filter((name): name is string => typeof name === 'string')
      : []
    const keys = names.length > 0 ? names : Object.keys(pool)

    respond(JSON.stringify({ errcode: 0, errmsg: '', data: pick(pool, keys) }))
  }
}

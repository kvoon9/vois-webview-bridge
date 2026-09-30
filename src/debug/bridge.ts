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
 * Params adopted for the debug session, outliving the pool they last landed in:
 * a bridge created later (a re-enable, a late `onBridgeReady`) still answers them.
 */
const debugParams: Record<string, string> = {}

/** The most recently created local bridge's param pool, when one is live. */
let livePool: Record<string, string> | null = null

/**
 * Adopt params into the debug session, as if native had started answering
 * with them. Later `get-page-params` reads serve them until the next call
 * overwrites the same names; a no-op until a local bridge exists is still
 * remembered for the next one.
 */
export function setDebugPageParams(params: Record<string, string>): void {
  Object.assign(debugParams, params)
  if (livePool) Object.assign(livePool, params)
}

/** @internal forget adopted params between tests. */
export function resetDebugPageParams(): void {
  for (const key of Object.keys(debugParams)) delete debugParams[key]
  livePool = null
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
  const pool: Record<string, string> = { ...STATIC_PARAMS, ...debugParams, ...pageParams }
  livePool = pool

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

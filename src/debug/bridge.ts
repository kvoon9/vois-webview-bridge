import type { NativeCall } from '../types.ts'
import type { DebugLogin } from './login.ts'

/**
 * A `NativeCall` backed by the login instead of a WebView, so the page cannot tell
 * the difference: `get-page-params` answers exactly what native would, and anything
 * else is a no-op rather than an error.
 *
 * Unknown protocols are ignored on purpose. A debug session has no native side to
 * close a page or start a payment, and throwing would turn a page's normal flow
 * into a crash.
 */
export function createLocalBridge(login: DebugLogin): NativeCall {
  const pool: Record<string, string> = {
    'access-token': login.token,
    'device-type': 'debug',
    theme: 'light',
    lang: 'zh-CN',
  }
  if (login.userId !== undefined) pool['login-id'] = String(login.userId)

  return (type, data, onResponse) => {
    if (type !== 'get-page-params') return onResponse?.('{"errcode":0,"errmsg":"","data":{}}')

    // Native answers everything when no names are given, and filters when they are.
    const asked = (data as { params?: unknown })?.params
    const names = Array.isArray(asked) ? asked.filter((name) => typeof name === 'string') : []
    const keys = names.length > 0 ? names : Object.keys(pool)
    const values = Object.fromEntries(
      keys.filter((key) => key in pool).map((key) => [key, pool[key]]),
    )

    onResponse?.(JSON.stringify({ errcode: 0, errmsg: '', data: values }))
  }
}

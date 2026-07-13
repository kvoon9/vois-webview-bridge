import { HANDLER_NAME } from './constants.ts'

/** How often to re-check for late `uniBridgeCall` injection (no ready event on iOS). */
const POLL_MS = 50

export function hasIosUniHandler(): boolean {
  return Boolean(window.webkit?.messageHandlers?.[HANDLER_NAME]?.postMessage)
}

/**
 * Resolve when `webkit.messageHandlers.uniBridgeCall` is available.
 * If already present, resolves immediately; otherwise polls until injection
 * (no timeout — same readiness model as Android WVJB wait).
 */
export function whenIosUniHandler(): Promise<void> {
  return new Promise((resolve) => {
    if (hasIosUniHandler()) {
      resolve()
      return
    }

    const timer = setInterval(() => {
      if (hasIosUniHandler()) {
        clearInterval(timer)
        resolve()
      }
    }, POLL_MS)
  })
}

/** iOS has limited support for callback names; strip `-` and `:`. */
function buildCallbackName(type: string): string {
  return `bridge-callback:${type}`.replace(/[-:]/g, '_')
}

/**
 * Native invokes `window[callbackName](jsonString)` when the request completes.
 * @returns name to put on the outbound payload as `callbackName`
 */
export function registerIosCallback(type: string, onResponse: (raw: string) => void): string {
  const callbackName = buildCallbackName(type)
  ;(window as unknown as Record<string, (raw: string) => void>)[callbackName] = onResponse
  return callbackName
}

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

/** Monotonic suffix so two same-protocol requests never share a callback slot. */
let callbackSeq = 0

/** Native hosts may construct a JavaScript function call from this identifier. */
const NON_IDENTIFIER = /[^A-Za-z0-9_$]/g

/** A unique, plain JS identifier per request (iOS is picky about callback names). */
function buildCallbackName(type: string, seq: number): string {
  return `bridge_callback_${type.replace(NON_IDENTIFIER, '_')}_${seq}`
}

/**
 * Native invokes `window[callbackName](jsonString)` with the exact name supplied on
 * the outbound payload. Each request gets its own slot, removed as soon as it is
 * delivered, so a late reply cannot land on a newer request of the same protocol.
 *
 * @returns name to put on the outbound payload as `callbackName`
 */
export function registerIosCallback(type: string, onResponse: (raw: string) => void): string {
  const callbackName = buildCallbackName(type, ++callbackSeq)
  const handlers = window as unknown as Record<string, ((raw: string) => void) | undefined>

  handlers[callbackName] = (raw) => {
    delete handlers[callbackName]
    onResponse(raw)
  }
  return callbackName
}

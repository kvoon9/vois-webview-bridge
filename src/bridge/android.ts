import type { WebViewJavascriptBridge } from '../types.ts'

/** WVJB allows `init` only once per injected bridge object. */
let androidInitialized = false

function ensureInitialized(bridge: WebViewJavascriptBridge): void {
  if (androidInitialized) {
    return
  }
  androidInitialized = true
  bridge.init((_message, responseCallback) => {
    responseCallback({ 'Javascript Responds': 'Wee!' })
  })
}

/**
 * Resolve when `WebViewJavascriptBridge` is on `window`.
 * If already injected, resolves immediately; otherwise waits for
 * `WebViewJavascriptBridgeReady` (no timeout). Runs WVJB `init` once.
 */
export function whenWebViewJavascriptBridge(): Promise<WebViewJavascriptBridge> {
  return new Promise((resolve) => {
    const finish = (bridge: WebViewJavascriptBridge) => {
      ensureInitialized(bridge)
      resolve(bridge)
    }

    if (window.WebViewJavascriptBridge) {
      finish(window.WebViewJavascriptBridge)
      return
    }

    document.addEventListener(
      'WebViewJavascriptBridgeReady',
      () => {
        if (window.WebViewJavascriptBridge) {
          finish(window.WebViewJavascriptBridge)
        }
      },
      { once: true },
    )
  })
}

/** @internal test helper */
export function resetAndroidInitState(): void {
  androidInitialized = false
}

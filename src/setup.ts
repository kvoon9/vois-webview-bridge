import type { BridgeWindow, WebViewJavascriptBridge } from './types.ts'

export const HANDLER_NAME = 'uniBridgeCall'

let androidInitialized = false

function getWindow(): BridgeWindow {
  return window as BridgeWindow
}

/**
 * Wait for Android WebViewJavascriptBridge, then invoke `callback`.
 * iOS does not use this path — see `postMessage` via `webkit.messageHandlers`.
 */
export function whenAndroidBridgeReady(callback: (bridge: WebViewJavascriptBridge) => void): void {
  const win = getWindow()

  if (win.WebViewJavascriptBridge) {
    callback(win.WebViewJavascriptBridge)
    return
  }

  document.addEventListener(
    'WebViewJavascriptBridgeReady',
    () => {
      if (win.WebViewJavascriptBridge) {
        callback(win.WebViewJavascriptBridge)
      }
    },
    false,
  )
}

/** Android WVJB requires a one-time `init` before `callHandler`. */
export function ensureAndroidInitialized(bridge: WebViewJavascriptBridge): void {
  if (androidInitialized) {
    return
  }
  androidInitialized = true
  bridge.init((_message, responseCallback) => {
    responseCallback({ 'Javascript Responds': 'Wee!' })
  })
}

export function hasIosUniHandler(): boolean {
  return Boolean(getWindow().webkit?.messageHandlers?.[HANDLER_NAME]?.postMessage)
}

export function buildCallbackName(type: string): string {
  // iOS has limited support for callback names; strip `-` and `:`.
  return `bridge-callback:${type}`.replace(/[-:]/g, '_')
}

/** @internal test helper */
export function resetAndroidInitState(): void {
  androidInitialized = false
}

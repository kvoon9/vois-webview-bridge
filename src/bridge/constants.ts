import type { NativeCall, WebViewJavascriptBridge } from '../types.ts'
import { registerIosCallback } from './ios.ts'

/** Native message handler name for the uni protocol (Android + iOS). */
export const HANDLER_NAME = 'uniBridgeCall'

/** Android: dispatch via WVJB `callHandler`. */
export function createAndroidHandler(wvjb: WebViewJavascriptBridge): NativeCall {
  return (type, data, onResponse) => {
    wvjb.callHandler(HANDLER_NAME, JSON.stringify({ type, data }), onResponse)
  }
}

/** iOS: dispatch via `webkit.messageHandlers.uniBridgeCall.postMessage`. */
export function createIosHandler(): NativeCall {
  return (type, data, onResponse) => {
    const payload = onResponse
      ? { type, data, callbackName: registerIosCallback(type, onResponse) }
      : { type, data }
    window.webkit!.messageHandlers![HANDLER_NAME]!.postMessage(JSON.stringify(payload))
  }
}

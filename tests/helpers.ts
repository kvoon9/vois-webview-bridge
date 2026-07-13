import { afterEach, beforeEach, vi } from 'vite-plus/test'

import { resetAndroidInitState } from '../src/bridge/android.ts'
import { resetBridgeState } from '../src/bridge/ready.ts'
import { onBridgeReady } from '../src/index.ts'
import type { WebViewJavascriptBridge, WebviewBridge } from '../src/types.ts'

export function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
  })
}

export const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36'

export const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

export const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'

export function installAndroidBridge(): {
  bridge: WebViewJavascriptBridge
  callHandler: ReturnType<typeof vi.fn>
  init: ReturnType<typeof vi.fn>
} {
  const callHandler = vi.fn((_name: string, _data: unknown, callback?: (data: string) => void) => {
    callback?.(JSON.stringify({ errcode: 0, errmsg: 'ok' }))
  })
  const init = vi.fn()

  const bridge: WebViewJavascriptBridge = {
    init,
    callHandler,
  }

  window.WebViewJavascriptBridge = bridge

  return { bridge, callHandler, init }
}

export function installIosHandler(): { postMessage: ReturnType<typeof vi.fn> } {
  const postMessage = vi.fn()
  window.webkit = {
    messageHandlers: {
      uniBridgeCall: { postMessage },
    },
  }
  return { postMessage }
}

export function whenReady(): Promise<WebviewBridge> {
  return new Promise((resolve) => {
    onBridgeReady((bridge) => resolve(bridge))
  })
}

/** Shared lifecycle reset for bridge singleton + platform inject state. */
export function setupBridgeTestLifecycle() {
  beforeEach(() => {
    resetAndroidInitState()
    resetBridgeState()
    delete window.WebViewJavascriptBridge
    delete window.webkit
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
}

import { isAndroid, isIOS } from '../platform.ts'
import type { WebviewBridge } from '../types.ts'
import { whenWebViewJavascriptBridge } from './android.ts'
import { Bridge } from './bridge.ts'
import { createAndroidHandler, createIosHandler } from './constants.ts'
import { whenIosUniHandler } from './ios.ts'

type ReadyListener = (bridge: WebviewBridge) => void

/** Page-level singleton: one wait, one bridge, multi-subscriber. */
let readyBridge: Bridge | null = null
let waitStarted = false
const readyListeners: ReadyListener[] = []

function deliver(bridge: Bridge): void {
  readyBridge = bridge
  const listeners = readyListeners.splice(0, readyListeners.length)
  for (const listener of listeners) {
    try {
      listener(bridge)
    } catch (error: unknown) {
      // One listener must not block others; surface after the current stack.
      queueMicrotask(() => {
        throw error
      })
    }
  }
}

async function startWaiting(): Promise<void> {
  if (isAndroid()) {
    const wvjb = await whenWebViewJavascriptBridge()
    deliver(Bridge.create(createAndroidHandler(wvjb)))
  } else if (isIOS()) {
    await whenIosUniHandler()
    deliver(Bridge.create(createIosHandler()))
  }

  // Desktop / unknown UA: empty-wait forever.
}

function ensureWaitStarted(): void {
  if (waitStarted) {
    return
  }
  waitStarted = true
  void startWaiting()
}

/**
 * Register for the page-level ready bridge. Starts waiting for the native
 * channel on first call. If the bridge is already ready, `callback` runs
 * immediately with the same singleton instance.
 *
 * Unsupported environments never invoke `callback` — check {@link isSupportBridge}
 * first when you need a degrade path. There is no bridge-level error channel
 * and no readiness timeout.
 */
export function onBridgeReady(callback: ReadyListener): void {
  if (readyBridge) {
    callback(readyBridge)
    return
  }
  readyListeners.push(callback)
  ensureWaitStarted()
}

/** @internal test helper — reset page-level singleton between tests. */
export function resetBridgeState(): void {
  readyBridge = null
  waitStarted = false
  readyListeners.length = 0
}

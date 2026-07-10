import { BridgeNotAvailableError, BridgeProtocolError, BridgeTimeoutError } from './errors.ts'
import { detectPlatform } from './platform.ts'
import { ensureAndroidInitialized, hasIosUniHandler, whenAndroidBridgeReady } from './setup.ts'
import type { BridgeWindow, RequestOptions, WebviewBridge } from './types.ts'

const DEFAULT_TIMEOUT_MS = 60_000

/**
 * Create a WebView bridge (JS → native).
 *
 * - Android: `WebViewJavascriptBridge.callHandler('uniBridgeCall', …)`
 * - iOS: `webkit.messageHandlers.uniBridgeCall.postMessage(…)`
 */
export function createBridge(): WebviewBridge {
  const platform = detectPlatform()
  const win = window as BridgeWindow

  const $ready = new Promise<void>((resolve, reject) => {
    if (platform === 'android') {
      whenAndroidBridgeReady((bridge) => {
        ensureAndroidInitialized(bridge)
        resolve()
      })

      return
    }

    if (platform === 'ios') {
      if (hasIosUniHandler()) {
        resolve()
      } else {
        reject(
          new BridgeNotAvailableError(
            'iOS uniBridgeCall message handler is not available on window.webkit.messageHandlers',
          ),
        )
      }

      return
    }

    reject(new BridgeNotAvailableError())
  })

  // Avoid unhandled rejection when nobody awaits `ready`.
  $ready.catch(() => {})

  /** One call path — same shape as production `uniBridgeCall`. */
  function call(type: string, data: unknown, onResponse?: (raw: string) => void): void {
    if (platform === 'android') {
      whenAndroidBridgeReady((native) => {
        native.callHandler('uniBridgeCall', JSON.stringify({ type, data }), onResponse)
      })
      return
    }

    // iOS: postMessage only (no WebViewJavascriptBridge).
    const callbackName = `bridge-callback:${type}`.replace(/[-:]/g, '_')
    if (onResponse) {
      ;(win as unknown as Record<string, (raw: string) => void>)[callbackName] = onResponse
    }

    const payload = onResponse ? { type, data, callbackName } : { type, data }
    win.webkit!.messageHandlers!.uniBridgeCall!.postMessage(JSON.stringify(payload))
  }

  return {
    ready: $ready,

    send(type: string, data: unknown = {}): void {
      void $ready
        .then(() => {
          call(type, data)
        })
        .catch(() => {
          /* channel unavailable — fire-and-forget */
        })
    },

    request<T = unknown>(
      type: string,
      data: unknown = {},
      options: RequestOptions = {},
    ): Promise<T> {
      const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS

      const work = $ready.then(
        () =>
          new Promise<T>((resolve, reject) => {
            call(type, data, (raw) => {
              try {
                resolve(JSON.parse(raw) as T)
              } catch {
                reject(new BridgeProtocolError())
              }
            })
          }),
      )

      if (timeout === 0 || !Number.isFinite(timeout)) {
        return work
      }

      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new BridgeTimeoutError())
        }, timeout)

        work.then(
          (value) => {
            clearTimeout(timer)
            resolve(value)
          },
          (error: unknown) => {
            clearTimeout(timer)
            reject(error)
          },
        )
      })
    },
  }
}

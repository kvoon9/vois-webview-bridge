/**
 * Android WebViewJavascriptBridge surface used by the uni protocol.
 * (We only call `init` once and `callHandler('uniBridgeCall', …)`.)
 */
export interface WebViewJavascriptBridge {
  init(callback: (message: unknown, responseCallback: (data: unknown) => void) => void): void
  callHandler(name: string, data?: unknown, callback?: (data: string) => void): void
}

export interface UniBridgeCallPayload<T = unknown> {
  type: string
  data: T
  /** iOS only: global function name native will invoke with the response. */
  callbackName?: string
}

export interface WebviewBridge {
  /** Fire-and-forget: JS → native, no response. */
  send(type: string, data?: unknown): void

  /** Request/response: JS → native, waits for a parsed JSON response (no timeout). */
  request<T = unknown>(type: string, data?: unknown): Promise<T>
}

/** Lowest-level JS → native dispatch for the uni protocol (wired in `startWaiting`). */
export type NativeCall = (type: string, data: unknown, onResponse?: (raw: string) => void) => void

/** Native-injected WebView globals used by this package. */
declare global {
  interface Window {
    /** Android shell injects this. */
    WebViewJavascriptBridge?: WebViewJavascriptBridge
    /** iOS WKWebView script message handlers for the uni protocol. */
    webkit?: {
      messageHandlers?: {
        uniBridgeCall?: {
          postMessage: (message: string) => void
        }
      }
    }
  }
}

import type {
  BridgeRequestType,
  BridgeSendType,
  ProtocolCallParams,
  ProtocolResponse,
} from './protocol.ts'

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

/**
 * Ready bridge surface: typed `send` / `request` against {@link BridgeProtocolMap}.
 *
 * - {@link send} accepts known `mode: 'send'` keys (+ open string escape hatch).
 * - {@link request} accepts known `mode: 'request'` keys (+ open string escape hatch).
 */
export interface WebviewBridge {
  /** Fire-and-forget: JS → native, no response. */
  send<T extends BridgeSendType>(...args: ProtocolCallParams<T>): void

  /** Request/response: JS → native, waits for a parsed JSON response (no timeout). */
  request<T extends BridgeRequestType>(...args: ProtocolCallParams<T>): Promise<ProtocolResponse<T>>
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

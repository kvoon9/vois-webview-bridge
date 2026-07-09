/** WebViewJavascriptBridge instance injected by the native shell. */
export interface WebViewJavascriptBridge {
  init(callback: (message: unknown, responseCallback: (data: unknown) => void) => void): void;
  callHandler(name: string, data?: unknown, callback?: (data: string) => void): void;
  registerHandler(
    name: string,
    callback: (data: unknown, responseCallback?: (data: unknown) => void) => void,
  ): void;
}

export interface UniBridgeCallPayload<T = unknown> {
  type: string;
  data: T;
  /** iOS only: global function name native will invoke with the response. */
  callbackName?: string;
}

export interface RequestOptions {
  /**
   * Timeout in milliseconds for the whole request (including waiting for ready).
   * Default: `60_000`.
   * Pass `0` or `Infinity` to disable timeout.
   */
  timeout?: number;
}

export interface WebviewBridge {
  /**
   * Resolves when the native channel is ready.
   * Rejects with `BridgeNotAvailableError` when not running inside a supported WebView.
   */
  readonly ready: Promise<void>;

  /** Fire-and-forget: JS → native, no response. */
  send(type: string, data?: unknown): void;

  /** Request/response: JS → native, waits for a parsed JSON response. */
  request<T = unknown>(type: string, data?: unknown, options?: RequestOptions): Promise<T>;
}

export type BridgePlatform = "android" | "ios";

export interface BridgeWindow extends Window {
  WebViewJavascriptBridge?: WebViewJavascriptBridge;
  WVJBCallbacks?: Array<(bridge: WebViewJavascriptBridge) => void>;
  webkit?: {
    messageHandlers?: {
      uniBridgeCall?: {
        postMessage: (message: string) => void;
      };
    };
  };
}

import { BridgeNotAvailableError, BridgeProtocolError, BridgeTimeoutError } from "./errors.ts";
import { detectPlatform } from "./platform.ts";
import {
  HANDLER_NAME,
  buildCallbackName,
  ensureAndroidInitialized,
  hasIosUniHandler,
  setupWebViewJavascriptBridge,
} from "./setup.ts";
import type {
  BridgePlatform,
  BridgeWindow,
  RequestOptions,
  UniBridgeCallPayload,
  WebviewBridge,
} from "./types.ts";

const DEFAULT_TIMEOUT_MS = 60_000;

function getWindow(): BridgeWindow {
  return window as BridgeWindow;
}

function isTimeoutDisabled(timeout: number): boolean {
  return timeout === 0 || !Number.isFinite(timeout);
}

function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  if (isTimeoutDisabled(timeout)) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new BridgeTimeoutError());
    }, timeout);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Create a WebView bridge instance for JS → native communication.
 *
 * No import-time side effects: call this explicitly (typically once per page).
 * Protocol is fixed to the production uni bridge (`uniBridgeCall` + `{ type, data, callbackName? }`).
 */
export function createBridge(): WebviewBridge {
  const platform = detectPlatform();

  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  let readySettled = false;

  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = () => {
      if (readySettled) {
        return;
      }
      readySettled = true;
      resolve();
    };
    rejectReady = (error: Error) => {
      if (readySettled) {
        return;
      }
      readySettled = true;
      reject(error);
    };
  });

  // Avoid unhandled rejection when callers never await `ready`.
  ready.catch(() => {});

  if (!platform) {
    rejectReady(new BridgeNotAvailableError());
  } else if (platform === "android") {
    setupWebViewJavascriptBridge(platform, (bridge) => {
      ensureAndroidInitialized(bridge);
      resolveReady();
    });
  } else if (hasIosUniHandler()) {
    resolveReady();
  } else {
    rejectReady(
      new BridgeNotAvailableError(
        "iOS uniBridgeCall message handler is not available on window.webkit.messageHandlers",
      ),
    );
  }

  function dispatch(
    activePlatform: BridgePlatform,
    type: string,
    data: unknown,
    callback?: (raw: string) => void,
  ): void {
    if (activePlatform === "android") {
      const payload: UniBridgeCallPayload = { type, data };
      setupWebViewJavascriptBridge(activePlatform, (bridge) => {
        bridge.callHandler(HANDLER_NAME, JSON.stringify(payload), callback);
      });
      return;
    }

    // iOS: native invokes a global callback by name.
    const win = getWindow();
    const handler = win.webkit?.messageHandlers?.[HANDLER_NAME];
    if (!handler) {
      throw new BridgeNotAvailableError(
        "iOS uniBridgeCall message handler is not available on window.webkit.messageHandlers",
      );
    }

    const callbackName = buildCallbackName(type);
    if (callback) {
      const previous = (win as unknown as Record<string, unknown>)[callbackName];
      (win as unknown as Record<string, unknown>)[callbackName] = (raw: string) => {
        if (previous === undefined) {
          delete (win as unknown as Record<string, unknown>)[callbackName];
        } else {
          (win as unknown as Record<string, unknown>)[callbackName] = previous;
        }
        callback(raw);
      };
    }

    const payload: UniBridgeCallPayload = callback ? { type, data, callbackName } : { type, data };

    handler.postMessage(JSON.stringify(payload));
  }

  const bridge: WebviewBridge = {
    ready,

    send(type: string, data: unknown = {}): void {
      void ready
        .then(() => {
          if (!platform) {
            return;
          }
          dispatch(platform, type, data);
        })
        .catch(() => {
          // Fire-and-forget: drop when the channel never becomes available.
          // Callers that care should `await bridge.ready` first.
        });
    },

    request<T = unknown>(
      type: string,
      data: unknown = {},
      options: RequestOptions = {},
    ): Promise<T> {
      const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

      const run = async (): Promise<T> => {
        await ready;
        if (!platform) {
          throw new BridgeNotAvailableError();
        }

        return new Promise<T>((resolve, reject) => {
          try {
            dispatch(platform, type, data, (raw) => {
              try {
                resolve(JSON.parse(raw) as T);
              } catch {
                reject(new BridgeProtocolError());
              }
            });
          } catch (error) {
            reject(error instanceof Error ? error : new BridgeNotAvailableError(String(error)));
          }
        });
      };

      return withTimeout(run(), timeout);
    },
  };

  return bridge;
}

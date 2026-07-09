import type { BridgePlatform, BridgeWindow, WebViewJavascriptBridge } from "./types.ts";

const HANDLER_NAME = "uniBridgeCall";

let androidInitialized = false;

function getWindow(): BridgeWindow {
  return window as BridgeWindow;
}

/**
 * Install / wait for WebViewJavascriptBridge (required on Android).
 * Ported from the production setup used by Weila/Vois WebView H5 pages.
 */
export function setupWebViewJavascriptBridge(
  platform: BridgePlatform,
  callback: (bridge: WebViewJavascriptBridge) => void,
): void {
  const win = getWindow();

  if (platform === "android") {
    if (win.WebViewJavascriptBridge) {
      callback(win.WebViewJavascriptBridge);
      return;
    }

    document.addEventListener(
      "WebViewJavascriptBridgeReady",
      () => {
        if (win.WebViewJavascriptBridge) {
          callback(win.WebViewJavascriptBridge);
        }
      },
      false,
    );
    return;
  }

  // iOS WVJB bootstrap (kept for parity with existing pages; uni protocol uses messageHandlers).
  if (win.WebViewJavascriptBridge) {
    callback(win.WebViewJavascriptBridge);
    return;
  }

  if (win.WVJBCallbacks) {
    win.WVJBCallbacks.push(callback);
    return;
  }

  win.WVJBCallbacks = [callback];
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = "wvjbscheme://__BRIDGE_LOADED__";
  document.documentElement.appendChild(iframe);
  setTimeout(() => {
    document.documentElement.removeChild(iframe);
  }, 0);
}

export function ensureAndroidInitialized(bridge: WebViewJavascriptBridge): void {
  if (androidInitialized) {
    return;
  }
  androidInitialized = true;
  bridge.init((_message, responseCallback) => {
    responseCallback({ "Javascript Responds": "Wee!" });
  });
}

export function hasIosUniHandler(): boolean {
  return Boolean(getWindow().webkit?.messageHandlers?.[HANDLER_NAME]?.postMessage);
}

export function buildCallbackName(type: string): string {
  // iOS has limited support for callback names; strip `-` and `:`.
  return `bridge-callback:${type}`.replace(/[-:]/g, "_");
}

export { HANDLER_NAME };

/** @internal test helper */
export function resetAndroidInitState(): void {
  androidInitialized = false;
}

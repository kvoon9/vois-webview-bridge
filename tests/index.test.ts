import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import {
  BridgeNotAvailableError,
  BridgeProtocolError,
  BridgeTimeoutError,
  createBridge,
} from "../src/index.ts";
import { resetAndroidInitState } from "../src/setup.ts";
import type { WebViewJavascriptBridge } from "../src/types.ts";

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

function installAndroidBridge() {
  const callHandler = vi.fn((_name: string, _data: unknown, callback?: (data: string) => void) => {
    callback?.(JSON.stringify({ errcode: 0, errmsg: "ok" }));
  });
  const init = vi.fn();

  const bridge: WebViewJavascriptBridge = {
    init,
    callHandler,
    registerHandler: vi.fn(),
  };

  (
    window as unknown as { WebViewJavascriptBridge: WebViewJavascriptBridge }
  ).WebViewJavascriptBridge = bridge;

  return { bridge, callHandler, init };
}

function installIosHandler() {
  const postMessage = vi.fn();
  (window as unknown as { webkit: unknown }).webkit = {
    messageHandlers: {
      uniBridgeCall: { postMessage },
    },
  };
  return { postMessage };
}

beforeEach(() => {
  resetAndroidInitState();
  delete (window as unknown as { WebViewJavascriptBridge?: unknown }).WebViewJavascriptBridge;
  delete (window as unknown as { webkit?: unknown }).webkit;
  delete (window as unknown as { WVJBCallbacks?: unknown }).WVJBCallbacks;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBridge — environment", () => {
  test("rejects ready when not in a mobile WebView", async () => {
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    const bridge = createBridge();
    await expect(bridge.ready).rejects.toBeInstanceOf(BridgeNotAvailableError);
    await expect(bridge.request("close-page")).rejects.toBeInstanceOf(BridgeNotAvailableError);
  });
});

describe("createBridge — Android", () => {
  beforeEach(() => {
    setUserAgent("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36");
  });

  test("send and request go through uniBridgeCall", async () => {
    const { callHandler, init } = installAndroidBridge();
    const bridge = createBridge();
    await bridge.ready;

    expect(init).toHaveBeenCalledOnce();

    bridge.send("close-page");
    // send is async after ready microtask
    await vi.waitFor(() => {
      expect(callHandler).toHaveBeenCalled();
    });

    const [name, payload] = callHandler.mock.calls[0]!;
    expect(name).toBe("uniBridgeCall");
    expect(JSON.parse(payload as string)).toEqual({ type: "close-page", data: {} });

    callHandler.mockClear();
    const res = await bridge.request<{ errcode: number }>("ios-app-prepay", { product_id: "x" });
    expect(res).toEqual({ errcode: 0, errmsg: "ok" });
    expect(callHandler).toHaveBeenCalledOnce();
  });

  test("queues request until bridge is ready", async () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36");
    const callHandler = vi.fn(
      (_name: string, _data: unknown, callback?: (data: string) => void) => {
        callback?.(JSON.stringify({ ok: true }));
      },
    );
    const init = vi.fn();

    // Do not install bridge yet — simulate late injection
    const pending = createBridge();
    const reqPromise = pending.request<{ ok: boolean }>("ping");

    // Inject after a tick
    await Promise.resolve();
    (
      window as unknown as { WebViewJavascriptBridge: WebViewJavascriptBridge }
    ).WebViewJavascriptBridge = {
      init,
      callHandler,
      registerHandler: vi.fn(),
    };
    document.dispatchEvent(new Event("WebViewJavascriptBridgeReady"));

    await expect(reqPromise).resolves.toEqual({ ok: true });
  });

  test("times out when native never responds", async () => {
    const { callHandler } = installAndroidBridge();
    callHandler.mockImplementation(() => {
      /* never call back */
    });

    const bridge = createBridge();
    await expect(bridge.request("slow", {}, { timeout: 30 })).rejects.toBeInstanceOf(
      BridgeTimeoutError,
    );
  });

  test("rejects on invalid JSON response", async () => {
    const { callHandler } = installAndroidBridge();
    callHandler.mockImplementation(
      (_name: string, _data: unknown, callback?: (data: string) => void) => {
        callback?.("not-json");
      },
    );

    const bridge = createBridge();
    await expect(bridge.request("bad")).rejects.toBeInstanceOf(BridgeProtocolError);
  });
});

describe("createBridge — iOS", () => {
  beforeEach(() => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    );
  });

  test("request posts to messageHandlers and resolves via window callback", async () => {
    const { postMessage } = installIosHandler();
    const bridge = createBridge();
    await bridge.ready;

    const promise = bridge.request<{ errcode: number }>("wechat-app-prepay", { a: 1 });

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledOnce();
    });
    const payload = JSON.parse(postMessage.mock.calls[0]![0] as string) as {
      type: string;
      data: unknown;
      callbackName: string;
    };
    expect(payload.type).toBe("wechat-app-prepay");
    expect(payload.data).toEqual({ a: 1 });
    expect(payload.callbackName).toBe("bridge_callback_wechat_app_prepay");

    const cb = (window as unknown as Record<string, (raw: string) => void>)[payload.callbackName];
    expect(typeof cb).toBe("function");
    cb(JSON.stringify({ errcode: 0 }));

    await expect(promise).resolves.toEqual({ errcode: 0 });
  });

  test("rejects ready when message handler is missing", async () => {
    const bridge = createBridge();
    await expect(bridge.ready).rejects.toBeInstanceOf(BridgeNotAvailableError);
  });
});

describe("platform helpers", () => {
  test("buildCallbackName strips - and :", async () => {
    const { buildCallbackName } = await import("../src/setup.ts");
    expect(buildCallbackName("close-page")).toBe("bridge_callback_close_page");
    expect(buildCallbackName("a:b-c")).toBe("bridge_callback_a_b_c");
  });
});

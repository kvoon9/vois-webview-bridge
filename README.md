# @vois/webview-bridge

JS → native WebView bridge for Vois / Weila H5 pages.

Protocol layer only: `send` (fire-and-forget) and `request` (wait for response).  
No payment helpers, no legacy `bridge` API.

## Install

```bash
pnpm add @vois/webview-bridge
```

## Usage

```ts
import { isSupportBridge, onBridgeReady } from '@vois/webview-bridge'

if (!isSupportBridge()) {
  // Browser / no native channel — degrade UI
} else {
  // onBridgeReady is the only way to obtain a usable bridge
  onBridgeReady((bridge) => {
    bridge.send('close-page')

    void bridge.request<{ errcode: number; errmsg: string }>('ios-app-prepay', {
      product_id: 'sku_1',
      product_name: 'VIP',
      product_desc: 'VIP membership',
      amount: 1,
      currency: 'CNY',
    })
  })
}
```

- `isSupportBridge()` — environment **worth waiting** on (not “already usable”).
  - Android / iOS UA → `true` even before native injects
- `onBridgeReady(cb)` — subscribe + ensure wait has started; page-level **singleton** multi-cast.
  - Already ready → `cb` runs immediately with the same instance
  - Unsupported / never injected → `cb` is **never** called (no throw, no bridge-level error)

### Request

```ts
await bridge.request('some-type', { foo: 1 })
// Waits until native responds — no request timeout
```

### Errors

| Error                 | When                            |
| --------------------- | ------------------------------- |
| `BridgeProtocolError` | Response body is not valid JSON |

Business `errcode` values stay in the resolved payload; the library does not interpret them.

There is no connect timeout and no request timeout. Degrade with `isSupportBridge()`; hang on `request` if native never answers is the caller’s concern.

## Design notes

- **No import side effects** — call `onBridgeReady` explicitly (first call starts waiting).
- **Lifecycle** — only `onBridgeReady(bridge)` hands out a ready instance; no half-ready object.
- **No internal ready queue** for `send`/`request` — no bridge object until the channel is ready.
- **No bridge-level `onError`** — use `isSupportBridge()` for environment checks.
- **`Bridge` / `WebviewBridge`** — public surface is `send` / `request`.
- **ESM only** — consume via a bundler (`import` from `@vois/webview-bridge`).
- Fixed host protocol: handler `uniBridgeCall`, payload `{ type, data, callbackName? }`.

### Transport (what we actually use)

| Platform    | Channel                                                      | Notes                                                                  |
| ----------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Android** | `WebViewJavascriptBridge.callHandler('uniBridgeCall', …)`    | Wait for `WebViewJavascriptBridgeReady`; `init` once                   |
| **iOS**     | `window.webkit.messageHandlers.uniBridgeCall.postMessage(…)` | Wait until handler injects (poll); response via `window[callbackName]` |

Legacy WVJB helpers (`exit`, `wxPayReqV2`, `savePicture`, …) are **not** part of this package.

## Develop

```bash
vp install
vp test
vp pack              # build dist/
vp check             # format + lint + types
vp run dev:playground  # open in a real App WebView to exercise the bridge
```

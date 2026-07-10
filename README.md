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
import { createBridge, BridgeNotAvailableError } from '@vois/webview-bridge'

const bridge = createBridge()

// Optional: fail fast if not inside the app shell
await bridge.ready

// No response
bridge.send('close-page')

// Wait for native response (default timeout 60s)
const res = await bridge.request<{ errcode: number; errmsg: string }>('ios-app-prepay', {
  product_id: 'sku_1',
  product_name: 'VIP',
  product_desc: 'VIP membership',
  amount: 1,
  currency: 'CNY',
})
```

### Request options

```ts
await bridge.request('some-type', { foo: 1 }, { timeout: 120_000 })
// timeout: 0 | Infinity → no timeout
```

### Errors

| Error                     | When                                    |
| ------------------------- | --------------------------------------- |
| `BridgeNotAvailableError` | Not in a supported Android/iOS WebView  |
| `BridgeTimeoutError`      | Native did not respond within `timeout` |
| `BridgeProtocolError`     | Response body is not valid JSON         |

Business `errcode` values stay in the resolved payload; the library does not interpret them.

## Design notes

- **No import side effects** — call `createBridge()` explicitly.
- **`ready`** — resolves when the native channel is usable; `send` / `request` queue until then.
- **ESM only** — consume via a bundler (`import` from `@vois/webview-bridge`).
- Fixed host protocol: handler `uniBridgeCall`, payload `{ type, data, callbackName? }`.

### Transport (what we actually use)

| Platform    | Channel                                                      | Notes                                                                           |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Android** | `WebViewJavascriptBridge.callHandler('uniBridgeCall', …)`    | Wait for `WebViewJavascriptBridgeReady`; one-time `init`                        |
| **iOS**     | `window.webkit.messageHandlers.uniBridgeCall.postMessage(…)` | Response via `window[callbackName](jsonString)`; **no** WVJB / iframe bootstrap |

Legacy WVJB helpers (`exit`, `wxPayReqV2`, `savePicture`, …) are **not** part of this package.

## Develop

```bash
vp install
vp test
vp pack              # build dist/
vp check             # format + lint + types
vp run dev:playground  # open in a real App WebView to exercise the bridge
```

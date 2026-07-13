# @vois/webview-bridge

Typed `send` / `request` WebView bridge (JS → Native) with an extensible protocol map.

Primarily used by Vois / Weila H5 pages, but the core is protocol-agnostic.

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
    // Protocols are provided by you via `BridgeProtocolMap` (see below)
    bridge.send('close-page')

    void bridge.request('my-feature', { foo: 'bar' })
  })
}
```

- `isSupportBridge()` — environment **worth waiting** on (not “already usable”).
  - Android / iOS UA → `true` even before native injects
- `onBridgeReady(cb)` — subscribe + ensure wait has started; page-level **singleton** multi-cast.
  - Already ready → `cb` runs immediately with the same instance
  - Unsupported / never injected → `cb` is **never** called (no throw, no bridge-level error)

### Protocol map

`send` / `request` are typed against `BridgeProtocolMap`. By default this map is **empty** — you decide which protocols exist.

Each entry follows a simple shape convention. `BridgeFn` is an optional helper:

| Shape                      | Meaning                          |
| -------------------------- | -------------------------------- |
| `BridgeFn`                 | send, no payload                 |
| `BridgeFn<Data>`           | send, with payload               |
| `BridgeFn<Data, Response>` | request, with payload + response |

You may also write the shapes directly: `{}`, `{ data: ... }`, or `{ data: ..., response: ... }`.

### Adding your own protocols (recommended)

Use TypeScript module augmentation to register your protocols. This is the primary and recommended way to use the library.

```ts
// e.g. src/bridge-protocols.d.ts  (make sure it is included by tsconfig)
import type { BridgeFn } from '@vois/webview-bridge'

declare module '@vois/webview-bridge' {
  interface BridgeProtocolMap {
    'share-text': BridgeFn<{ title: string; text: string }>
    'log-event': BridgeFn<{ name: string }>
    'my-custom-action': BridgeFn<MyRequest, MyResponse>
  }
}
```

After augmentation you get full autocomplete and type safety:

```ts
bridge.send('log-event', { name: 'page_view' })
const res = await bridge.request('my-custom-action', { ... })
// res is typed as MyResponse
```

**Rules of thumb**

- Same wire `type` defined with incompatible shapes → TypeScript error.
- Prefer `interface` for payload types so consumers can merge extra fields later.
- The declaration file must be part of your TypeScript program.

### Using built-in Vois / Weila app protocols (optional)

If you want the protocols that the official Vois/Weila apps currently support, import the dedicated entry point:

```ts
// Option A — simplest (recommended for most Vois apps)
import '@vois/webview-bridge/vois'

// Option B — explicit
import type { VoisAppProtocolMap } from '@vois/webview-bridge/vois'

declare module '@vois/webview-bridge' {
  interface BridgeProtocolMap extends VoisAppProtocolMap {}
}
```

This brings in the following protocols:

| Protocol `type`     | Mode    | Data           | Response       |
| ------------------- | ------- | -------------- | -------------- |
| `close-page`        | send    | none           | —              |
| `wechat-app-prepay` | request | `WechatPrepay` | `WechatPayRes` |
| `ios-app-prepay`    | request | `IOSPrepay`    | `IOSPayRes`    |

You can freely mix built-in protocols with your own:

```ts
// 1. Bring in the official Vois built-ins
import '@vois/webview-bridge/vois'

// 2. Add your own protocols on top
import type { BridgeFn } from '@vois/webview-bridge'
import type { WechatPrepay } from '@vois/webview-bridge/vois'

declare module '@vois/webview-bridge' {
  interface BridgeProtocolMap {
    // your custom protocols
    'share-text': BridgeFn<{ title: string; text: string }>
    'log-event': BridgeFn<{ name: string; params?: Record<string, unknown> }>

    // you can even re-use the built-in payload types if needed
    'custom-wechat-pay': BridgeFn<WechatPrepay, { success: boolean }>
  }
}
```

Typical usage after the above:

```ts
onBridgeReady((bridge) => {
  bridge.send('close-page') // from vois built-in
  bridge.send('log-event', { name: 'view' }) // your custom

  void bridge.request('wechat-app-prepay', prepayData) // from vois
  void bridge.request('share-text', { title: 'Hi', text: 'Hello' })
})
```

The payload types (`WechatPrepay`, `IOSPrepay`, etc.) are exported from the same subpath for your convenience:

```ts
import type { WechatPrepay, IOSPrepay } from '@vois/webview-bridge/vois'
```

### Request example (after you have registered protocols)

```ts
await bridge.request('my-payment', {
  productId: 'xxx',
  amount: 100,
})
// Waits until native responds — no request timeout

// Unknown string keys are always allowed (data/response become `unknown`)
await bridge.request('some-future-protocol', { foo: 1 })
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
- **Protocol map** — types only; `BridgeProtocolMap` is empty by default. You (or `@vois/webview-bridge/vois`) extend it via module augmentation. No runtime registration or mixins.
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

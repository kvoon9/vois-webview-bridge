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

| Protocol `type`     | Mode    | Data            | Response        |
| ------------------- | ------- | --------------- | --------------- |
| `close-page`        | send    | none            | —               |
| `get-page-params`   | request | `GetPageParams` | `PageParamsRes` |
| `wechat-app-prepay` | request | `WechatPrepay`  | `WechatPayRes`  |
| `ios-app-prepay`    | request | `IOSPrepay`     | `IOSPayRes`     |

The access token is a page parameter: request `get-page-params` with
`params: ['access-token']` and read `data['access-token']`.

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

| Platform    | Channel                                                      | Notes                                                                                            |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Android** | `WebViewJavascriptBridge.callHandler('uniBridgeCall', …)`    | Wait for `WebViewJavascriptBridgeReady`; `init` once                                             |
| **iOS**     | `window.webkit.messageHandlers.uniBridgeCall.postMessage(…)` | Wait until handler injects (poll); response via the exact `callbackName` supplied on the payload |

Legacy WVJB helpers (`exit`, `wxPayReqV2`, `savePicture`, …) are **not** part of this package.

## Debug bridge (dev / debug preview only)

`@vois/webview-bridge/debug` provides a synthetic bridge for pages served without a native side:

```ts
import { enableDebugBridge, getDebugAccessToken } from '@vois/webview-bridge/debug'

if (isWebviewDebug()) enableDebugBridge()
```

- `enableDebugBridge(credentials?)` — registers a bridge that is ready immediately. Its `get-page-params` answers static debug environment params (plus any params the local bridge was constructed with) and **never logs in**, so native-returned page params stay the first source of truth.
- `getDebugAccessToken()` — the explicit fallback. Only when `get-page-params` had no `access-token` should a dev / debug-preview page call this; it logs in with the fixed debug account (or the credentials passed to `enableDebugBridge`) and resolves the token. Concurrent calls share one login, a success is reused, and a failure is forgotten so the next call retries.

Gate both behind your own debug detection and never import this entry from shipped code paths.

## Develop

```bash
vp install
vp test
vp pack              # build dist/
vp check             # format + lint + types
vp run dev:playground  # open in a real App WebView to exercise the bridge
```

## Documentation

Full documentation (bilingual EN/ZH + LLM-friendly output) follows this structure:

1. [Introduction](/)
2. [Data Spec](/data-spec) — Request / Response wire format
3. [Web Usage](/web-usage) — Install, Bridge Instance, Error Handling, Built-in, Custom protocols
4. [Native Preparation](/native/android) — Android & iOS integration with code examples

```bash
pnpm dev:docs
pnpm build:docs
```

LLM-optimized files (`llm.md`, `llms-full.txt`) are generated on build. Every page includes a "Copy as Markdown" button.

## Deployment (Cloudflare Pages)

Docs + playground → Cloudflare Pages via `wrangler`（`vpx` 运行，不进依赖）。纯 CLI，不依赖 Dashboard。

```bash
# 首次
vpx wrangler login
vpx wrangler pages project create webview-bridge
vpx wrangler pages project create webview-bridge-playground

# 构建 + 部署
pnpm build:site && pnpm deploy

# 分开
pnpm build:docs && pnpm deploy:docs
pnpm build:playground && pnpm deploy:playground

# 预览分支
pnpm deploy:docs -- --branch=feature-xxx

# CI / 非交互
CLOUDFLARE_API_TOKEN=... pnpm deploy
```

项目名：`vois-webview-bridge-docs` / `vois-webview-bridge-playground`。

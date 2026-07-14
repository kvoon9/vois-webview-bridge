---
title: Web Usage
description: "Using the bridge from web pages — installation, bridge instance, error handling, built-in and custom protocols"
sidebar:
  order: 10
---

## Install

```bash
pnpm add @vois/webview-bridge
```

You can also use `npm` or `yarn` according to your project setup.

```bash
npm install @vois/webview-bridge
# or
yarn add @vois/webview-bridge
```

The package is ESM-only and is intended to be consumed through a bundler.

## Get a Bridge Instance

A usable bridge instance is **only** delivered through `onBridgeReady`. There is no synchronous way to obtain it.

```ts
import { isSupportBridge, onBridgeReady } from '@vois/webview-bridge'

if (!isSupportBridge()) {
  // Not inside a supported Vois / Weila WebView.
  // You should degrade UI or show appropriate messaging.
  return
}

// Recommended: call early in the page lifecycle
onBridgeReady((bridge) => {
  // `bridge` is now safe to use
  bridge.send('close-page')
})
```

### Important Semantics

- `isSupportBridge()` only checks the User-Agent. It returns `true` for Android/iOS even **before** the native bridge object is injected.
- `onBridgeReady` starts the waiting process on first call (page-level singleton).
- If the bridge is already ready when you call `onBridgeReady`, the callback is invoked **immediately** with the same instance.
- In unsupported environments (desktop browser, etc.), the callback is **never** invoked.
- There is no timeout. If native never injects the bridge, your callbacks will never run.

### Typical Pattern

```ts
import { isSupportBridge, onBridgeReady } from '@vois/webview-bridge'

let bridge: WebviewBridge | null = null

if (isSupportBridge()) {
  onBridgeReady((b) => {
    bridge = b
    // You can now safely call native features
  })
}

// Later in event handlers:
function closePage() {
  if (bridge) {
    bridge.send('close-page')
  } else {
    // fallback behavior
  }
}
```

## Error Handling

The library surface is intentionally small regarding errors.

### Only One Library Error

`BridgeProtocolError` is thrown **only** when the response from native cannot be parsed as JSON:

```ts
import { BridgeProtocolError } from '@vois/webview-bridge'

try {
  const result = await bridge.request('some-action')
} catch (err) {
  if (err instanceof BridgeProtocolError) {
    // Native sent malformed JSON
    console.error('Bridge protocol violation')
  }
}
```

### Business Errors

Business-level errors (authentication failure, validation error, etc.) **must** be expressed inside the response payload. The promise will still resolve.

```ts
const result = await bridge.request('submit-order', orderData)

if (result.errcode !== 0) {
  // handle business error
  showToast(result.errmsg)
  return
}
```

### No Bridge-Level Error Handler

There is deliberately no `bridge.onError` or similar. Use `isSupportBridge()` for environment detection and handle business errors in response data.

## Built-in Functions

The official Vois / Weila applications expose a small set of commonly used protocols.

To enable them, import the dedicated entry point:

```ts
// Side-effect import — registers the protocols via module augmentation
import '@vois/webview-bridge/vois'
```

After this import, the following protocols become available with full type information:

| Protocol            | Mode    | Payload Type   | Response Type  | Description                 |
| ------------------- | ------- | -------------- | -------------- | --------------------------- |
| `close-page`        | send    | —              | —              | Close current WebView page  |
| `wechat-app-prepay` | request | `WechatPrepay` | `WechatPayRes` | WeChat Pay (mainly Android) |
| `ios-app-prepay`    | request | `IOSPrepay`    | `IOSPayRes`    | In-app purchase (iOS)       |

### Usage Example

```ts
import '@vois/webview-bridge/vois'
import type { WechatPrepay, IOSPrepay } from '@vois/webview-bridge/vois'

onBridgeReady((bridge) => {
  bridge.send('close-page')

  void bridge.request('wechat-app-prepay', {
    appid: 'wx...',
    partnerid: '...',
    prepay_id: '...',
    noncestr: '...',
    timestamp: 1752400000,
    sign: '...',
  })

  void bridge.request('ios-app-prepay', {
    product_id: 'vip_monthly',
    product_name: 'VIP Monthly',
    product_desc: 'Unlock all features',
    amount: 1990,
    currency: 'CNY',
  })
})
```

You can freely mix built-in protocols with your own custom protocols (see next section).

## Custom (Define a Webview Function)

You define your own protocols using TypeScript **module augmentation**. This is the primary and recommended way to extend the bridge.

### Declaring Protocols

Create a declaration file (e.g. `src/types/bridge.d.ts`) and make sure it is included by your `tsconfig.json`:

```ts
import type { BridgeFn } from '@vois/webview-bridge'

declare module '@vois/webview-bridge' {
  interface BridgeProtocolMap {
    // send, no payload
    'close-page': {}

    // send, with payload
    'share-text': BridgeFn<{ title: string; text: string }>

    // request, with payload and response
    'get-user-info': BridgeFn<{ userId: number }, { name: string; avatar: string }>
  }
}
```

Rules:

- Use `BridgeFn` helper when possible for clarity.
- You can also write the shape inline: `{}`, `{ data: T }`, or `{ data: T; response: R }`.
- The declaration file must participate in type checking.
- Unknown protocol strings are still allowed at runtime (typed as `unknown`).

### Send

Use `send` for actions that do not require a response from native.

#### Signature

```ts
bridge.send(type)
bridge.send(type, data)
```

#### Examples

```ts
// No payload
bridge.send('close-page')

// With payload
bridge.send('share-text', {
  title: 'Amazing content',
  text: 'Check out this article',
})

// With a custom protocol
bridge.send('log-event', {
  name: 'button_click',
  params: { button: 'buy' },
})
```

`send` is synchronous and fire-and-forget. It will not throw under normal circumstances (the call happens after the bridge is ready).

### Request

Use `request` when you need to receive data or acknowledgement from native.

#### Signature

```ts
const result = await bridge.request(type)
const result = await bridge.request(type, data)
```

The returned promise resolves with the value parsed from the JSON string sent back by native.

#### Examples

```ts
// No input data, expect response
const user = await bridge.request('get-user-info')

// With input data
const payResult = await bridge.request('create-order', {
  productId: 'vip',
  amount: 19900,
  currency: 'CNY',
})

console.log(payResult) // typed according to your declaration
```

#### Unknown Protocols

If you call a protocol that has not been declared, both `data` and the response are typed as `unknown`:

```ts
const res = await bridge.request('future-protocol-xyz', { foo: 1 })
// res is unknown
```

This escape hatch allows forward compatibility without losing the ability to call new native features.

## Recommendations

- Keep `type` strings stable — they form part of the contract between web and native.
- Prefer descriptive names (`open-camera` over `oc`).
- For breaking changes, version the identifier (e.g. `get-user-v2`).
- Place all protocol declarations in `.d.ts` files.
- Import `'@vois/webview-bridge/vois'` early if you need the built-in protocols.

---
title: FAQ
description: Frequently asked questions about the WebView bridge
sidebar:
  order: 100
---




## Callback is never invoked

- Verify that `isSupportBridge()` returns `true`. This confirms execution inside a supported app WebView.
- On iOS, the message handler may be injected asynchronously. The library will continue waiting, as no timeout is implemented by design.
- Timeouts are intentionally omitted from the library implementation.

## `request()` never resolves

This behavior is intentional. The library does not enforce request timeouts.

If a timeout is required, implement it at the application level:

```ts
const timeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Request timeout')), 10000),
)
await Promise.race([bridge.request('foo'), timeout])
```

## TypeScript does not recognize custom message types

Protocol shapes must be declared in a `.d.ts` file using module augmentation (`declare module`).

A standard `import` statement is not sufficient.

## Usage outside the Vois / Weila ecosystem

The bridge implementation is protocol-agnostic. It is compatible with any native layer that supports the `uniBridgeCall` message handler.

## Debugging recommendations

- Use the playground included in the repository.
- Add logging statements on both the web and native sides.
- On Android, inspect the `WebViewJavascriptBridge` global.
- Ensure the handler name is exactly `uniBridgeCall`.

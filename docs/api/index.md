---
title: API Reference
description: "Core exports and types for @vois/webview-bridge"
---


See the [Web Usage](/web-usage) guide for practical usage of the core APIs.

## Core Exports

```ts
import {
  isSupportBridge,
  onBridgeReady,
  BridgeError,
  BridgeProtocolError,
  type BridgeFn,
  type BridgeProtocolMap,
  type WebviewBridge,
} from '@vois/webview-bridge'
```

## Quick Reference

| API                           | Description                                                         |
| ----------------------------- | ------------------------------------------------------------------- |
| `isSupportBridge()`           | Returns `true` for Android/iOS User-Agents (even before injection). |
| `onBridgeReady(callback)`     | Receives the ready `WebviewBridge` instance (singleton).            |
| `bridge.send(type, data?)`    | Fire-and-forget message to native.                                  |
| `bridge.request(type, data?)` | Sends a request and returns `Promise<unknown>` (or typed response). |

## Error Types

- `BridgeProtocolError` — thrown only when a response cannot be parsed as JSON.

Business errors belong in the response payload.

Full types are in the published `.d.mts` files. See source under `src/protocol.ts` and `src/types.ts`.

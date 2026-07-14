---
title: API 参考
description: "@vois/webview-bridge 的核心导出和类型定义"
---

实际用法请参阅 [Web 端使用](/zh/web-usage) 指南。

## 核心导出

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

## 快速参考

| API                           | 说明                                                 |
| ----------------------------- | ---------------------------------------------------- |
| `isSupportBridge()`           | Android/iOS User-Agent 返回 `true`（即使尚未注入）。 |
| `onBridgeReady(callback)`     | 接收就绪的 `WebviewBridge` 实例（单例）。            |
| `bridge.send(type, data?)`    | 向原生单向发送消息。                                 |
| `bridge.request(type, data?)` | 发送请求，返回 `Promise`（可获得类型化响应）。       |

## 错误类型

- `BridgeProtocolError` — 仅当响应无法解析为 JSON 时抛出。

业务错误应放在响应负载中。

完整类型定义位于发布的 `.d.mts` 文件中，可参考 `src/protocol.ts` 和 `src/types.ts`。

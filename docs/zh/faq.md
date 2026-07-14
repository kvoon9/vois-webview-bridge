---
title: 常见问题
description: WebView Bridge 常见问题
sidebar:
  order: 100
---




## 回调未被执行

- 请确认 `isSupportBridge()` 返回 `true`，以验证代码运行在受支持的应用 WebView 环境中。
- 在 iOS 上，消息处理器可能异步注入。库会持续等待，因为按设计未实现超时机制。
- 库故意未提供超时功能。

## `request()` 始终不返回

此行为符合设计预期。库未实现请求超时。

如有需要，请在应用层自行实现超时逻辑：

```ts
const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
await Promise.race([bridge.request('xx'), timeout])
```

## TypeScript 无法识别自定义消息类型

协议形状必须在 `.d.ts` 文件中通过模块增强（`declare module`）进行声明。

仅使用 `import` 是不够的。

## 是否可在 Vois / Weila 之外使用？

桥接实现与具体协议无关。只要原生层实现了 `uniBridgeCall` 消息处理，即可兼容使用。

## 调试建议

- 使用仓库中提供的 playground 进行测试。
- 在 Web 和原生两端添加日志输出。
- 在 Android 上可检查 `WebViewJavascriptBridge` 对象。
- 确认 handler 名称必须精确为 `uniBridgeCall`。

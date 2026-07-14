---
title: 介绍
description: 适用于 Vois / Weila H5 页面的类型化 send / request WebView 桥接
sidebar:
  label: 概览
  order: 1
---

`@vois/webview-bridge` 为运行在原生 WebView 中的 H5 页面提供类型化的 `send` / `request` API，用于与 Native 通信。

## 安装

```bash
pnpm add @vois/webview-bridge
```

也可以使用 `npm` 或 `yarn`。

## 最简示例

```ts
import { onBridgeReady } from '@vois/webview-bridge'

onBridgeReady((bridge) => {
  bridge.send('close-page')
})
```

完整用法请参阅 [Web 端使用](/zh/web-usage)。

---
title: Web 端使用
description: "从 Web 页面使用桥接 —— 安装、获取实例、错误处理、内置与自定义协议"
sidebar:
  order: 10
---

## 安装

```bash
pnpm add @vois/webview-bridge
```

你也可以根据项目使用 `npm` 或 `yarn`：

```bash
npm install @vois/webview-bridge
# 或
yarn add @vois/webview-bridge
```

本包仅提供 ESM 格式，建议通过打包工具使用。

## 获取 Bridge 实例

可用的 bridge 实例**只能**通过 `onBridgeReady` 获取。没有同步获取方式。

```ts
import { isSupportBridge, onBridgeReady } from '@vois/webview-bridge'

if (!isSupportBridge()) {
  // 当前不在受支持的 Vois / Weila WebView 环境中
  // 应进行优雅降级或给出提示
  return
}

// 建议在页面生命周期早期尽早调用
onBridgeReady((bridge) => {
  // 此时 bridge 已安全可用
  bridge.send('close-page')
})
```

### 重要语义说明

- `isSupportBridge()` 仅判断 User-Agent。即使原生桥接对象尚未注入，在 Android/iOS 下也会返回 `true`。
- 首次调用 `onBridgeReady` 会启动等待流程（页面级单例）。
- 如果调用时 bridge 已经就绪，回调会**立即**用同一个实例执行。
- 在不支持的环境（桌面浏览器等）中，回调**永远不会**被调用。
- 没有超时机制。如果原生端始终不注入，回调将永远不会执行。

### 典型使用模式

```ts
import { isSupportBridge, onBridgeReady } from '@vois/webview-bridge'
import type { WebviewBridge } from '@vois/webview-bridge'

let bridge: WebviewBridge | null = null

if (isSupportBridge()) {
  onBridgeReady((b) => {
    bridge = b
  })
}

function closePage() {
  if (bridge) {
    bridge.send('close-page')
  } else {
    // 降级处理
  }
}
```

## 错误处理

库在错误处理方面的暴露面非常小。

### 唯一一种库级错误

只有当 Native 返回的数据无法解析为 JSON 时，才会抛出 `BridgeProtocolError`：

```ts
import { BridgeProtocolError } from '@vois/webview-bridge'

try {
  const result = await bridge.request('some-action')
} catch (err) {
  if (err instanceof BridgeProtocolError) {
    // 原生返回了非法 JSON
    console.error('Bridge protocol violation')
  }
}
```

### 业务错误

业务层面的错误（鉴权失败、参数校验失败等）**必须**放在响应负载中表达。此时 Promise 仍然会 resolve。

```ts
const result = await bridge.request('submit-order', orderData)

if (result.errcode !== 0) {
  showToast(result.errmsg)
  return
}
```

### 没有 Bridge 级错误处理器

库故意没有提供 `bridge.onError` 等机制。环境检测请使用 `isSupportBridge()`，业务错误请在响应数据中处理。

## 内置功能

Vois / Weila 官方应用提供了一组常用协议。

引入专用入口即可启用：

```ts
// 副作用导入，通过模块增强注册协议
import '@vois/webview-bridge/vois'
```

引入后可使用以下协议，并获得完整类型：

| 协议名              | 模式    | 请求类型       | 响应类型       | 说明                     |
| ------------------- | ------- | -------------- | -------------- | ------------------------ |
| `close-page`        | send    | —              | —              | 关闭当前 WebView 页面    |
| `wechat-app-prepay` | request | `WechatPrepay` | `WechatPayRes` | 微信支付（主要 Android） |
| `ios-app-prepay`    | request | `IOSPrepay`    | `IOSPayRes`    | 应用内购（iOS）          |

### 使用示例

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
    product_desc: '解锁全部功能',
    amount: 1990,
    currency: 'CNY',
  })
})
```

你可以将内置协议与自定义协议自由混用。

## 自定义协议（定义 Webview Function）

推荐使用 TypeScript **模块增强**来声明自己的协议。这是扩展桥接的主要方式。

### 声明协议

创建声明文件（例如 `src/types/bridge.d.ts`），确保被 `tsconfig.json` 包含：

```ts
import type { BridgeFn } from '@vois/webview-bridge'

declare module '@vois/webview-bridge' {
  interface BridgeProtocolMap {
    // send，无负载
    'close-page': {}

    // send，带负载
    'share-text': BridgeFn<{ title: string; text: string }>

    // request，带负载和响应
    'get-user-info': BridgeFn<{ userId: number }, { name: string; avatar: string }>
  }
}
```

规则：

- 优先使用 `BridgeFn` 辅助类型。
- 也可直接写形状：`{}`、`{ data: T }`、`{ data: T; response: R }`。
- 声明文件必须参与类型检查。
- 未声明的协议字符串在运行时仍然可用（类型为 `unknown`）。

### Send

当不需要 Native 返回响应时使用 `send`。

#### 用法

```ts
bridge.send(type)
bridge.send(type, data)
```

#### 示例

```ts
// 无负载
bridge.send('close-page')

// 带负载
bridge.send('share-text', {
  title: '精彩内容',
  text: '推荐阅读这篇文章',
})

// 自定义协议
bridge.send('log-event', {
  name: 'button_click',
  params: { button: 'buy' },
})
```

`send` 是同步的 fire-and-forget 调用，在 bridge 就绪后不会抛出异常。

### Request

当需要接收 Native 返回的数据或确认时使用 `request`。

#### 用法

```ts
const result = await bridge.request(type)
const result = await bridge.request(type, data)
```

返回的 Promise 会 resolve 为 Native 返回的 JSON 字符串解析后的值。

#### 示例

```ts
// 无输入数据，期望响应
const user = await bridge.request('get-user-info')

// 带输入数据
const payResult = await bridge.request('create-order', {
  productId: 'vip',
  amount: 19900,
  currency: 'CNY',
})

console.log(payResult) // 根据声明获得类型
```

#### 未声明的协议

调用未声明的协议时，`data` 和响应类型均为 `unknown`：

```ts
const res = await bridge.request('future-protocol-xyz', { foo: 1 })
// res 类型为 unknown
```

这种逃生舱允许向前兼容，同时仍可调用新的原生能力。

## 建议

- `type` 字符串属于契约，应保持稳定。
- 使用有意义的名称（如 `open-camera` 而非 `oc`）。
- 破坏性变更时对标识符进行版本化（例如 `get-user-v2`）。
- 将所有协议声明放在 `.d.ts` 文件中。
- 如需使用内置协议，请尽早导入 `'@vois/webview-bridge/vois'`。

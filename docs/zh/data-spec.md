---
title: 数据规范
description: Web 与 Native 之间的 JSON 消息格式
sidebar:
  order: 2
---


本文档描述通过 `uniBridgeCall` 桥接交换的数据格式。

核心目标很简单：让大家看懂 **JS 怎么把数据发给 Native**，以及 **Native 怎么把数据回给 JS**。

## JS 发给 Native 的消息

JavaScript 每次调用都会发送下面这种结构的 JSON：

```json
{
  "type": "string",
  "data": {}
}
```

### 字段说明

| 字段   | 说明                                                      |
| ------ | --------------------------------------------------------- |
| `type` | 协议名称，例如 `close-page`、`get-user-info`、`log-event` |
| `data` | 负载数据。始终是一个对象（无数据时传 `{}`）               |

对于需要响应的调用（JS 侧使用库的 `request()`），iOS 还会额外带上 `callbackName`。Android 不使用这个字段，响应通过 callHandler 的回调直接返回。

### 示例

**普通 send（不需要响应）**

```json
{ "type": "close-page", "data": {} }
```

**带数据的 send**

```json
{
  "type": "log-event",
  "data": { "name": "page_view", "page": "/home" }
}
```

**需要响应的调用**

```json
{
  "type": "get-user-info",
  "data": { "userId": 42 }
}
```

（在 iOS 上这类调用还会带 `callbackName` 字段用于回传响应。）

## Native 回给 JS 的响应

当 JS 使用 `request()` 发起需要响应的调用时，Native **必须**返回一个 JSON 字符串。

### 推荐的响应格式

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "data": {}
}
```

### 示例

**成功**

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "data": { "name": "Alice", "id": 42 }
}
```

**业务错误（桥接调用本身仍然成功）**

```json
{
  "errcode": 1001,
  "errmsg": "insufficient balance",
  "data": null
}
```

## Native 如何把响应传回 JS

- **Android**：在你注册 `uniBridgeCall` handler 时收到的 callback 上调用 `callback.onCallBack(jsonString)`
- **iOS**：调用 payload 里 `callbackName` 对应的全局函数：`window[callbackName](jsonString)`

JS 侧会把收到的字符串解析成 JSON。如果解析失败，Promise 会 reject。业务错误（`errcode != 0`）会作为 resolved 值返回，不会导致桥接调用失败。

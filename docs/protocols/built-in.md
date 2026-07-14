---
title: Built-in Protocols
sidebar:
  order: 40
---


The Vois / Weila application provides the following built-in protocols:

```ts
import '@vois/webview-bridge/vois'
```

After importing, the protocols become available:

```ts
bridge.send('close-page')
const result = await bridge.request('wechat-app-prepay', data)
```

### close-page

Closes the current WebView page.

```ts
bridge.send('close-page')
```

### wechat-app-prepay

Initiates a WeChat Pay request (primarily on Android).

```ts
const result = await bridge.request('wechat-app-prepay', {
  appid: 'wx...',
  partnerid: '...',
  prepay_id: '...',
  noncestr: '...',
  timestamp: 1234567890,
  sign: '...',
})
```

### ios-app-prepay

Initiates an in-app purchase request (on iOS).

```ts
const result = await bridge.request('ios-app-prepay', {
  product_id: 'vip',
  product_name: 'VIP Monthly',
  product_desc: '...',
  amount: 1990,
  currency: 'CNY',
})
```

Complete interface definitions are available in the package source.

---
title: 内置协议
sidebar:
  order: 40
---


Vois / Weila 应用提供以下内置协议：

```ts
import '@vois/webview-bridge/vois'
```

导入后即可使用：

```ts
bridge.send('close-page')
const result = await bridge.request('wechat-app-prepay', data)
```

### close-page

关闭当前 WebView 页面。

```ts
bridge.send('close-page')
```

### wechat-app-prepay

发起微信支付请求（主要用于 Android）。

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

发起应用内购买请求（用于 iOS）。

```ts
const result = await bridge.request('ios-app-prepay', {
  product_id: 'vip',
  product_name: 'VIP 月卡',
  product_desc: '...',
  amount: 1990,
  currency: 'CNY',
})
```

完整接口定义可在包源码中查看。

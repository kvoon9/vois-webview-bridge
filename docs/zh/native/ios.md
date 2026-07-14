---
title: 原生端准备 — iOS
description: iOS WKWebView + uniBridgeCall 原生实现指南
sidebar:
  label: iOS
  order: 22
---



# 原生端准备 — iOS

本文档介绍如何在 iOS 使用 `WKWebView` 处理桥接消息。

## 概述

在 iOS 上，JavaScript 侧通过以下方式通信：

```js
window.webkit.messageHandlers.uniBridgeCall.postMessage(jsonString)
```

- Handler 名称**必须**精确为 `uniBridgeCall`。
- `request` 调用时，负载中会包含 `callbackName`。
- 返回响应时执行：`window[callbackName](jsonResponseString)`。

JavaScript 侧会轮询该 handler 是否存在（系统不会主动派发 ready 事件）。

## 基础设置

### 1. 创建 WKWebView 并注册 Script Message Handler

```swift
import WebKit

class WebBridgeViewController: UIViewController, WKScriptMessageHandler {
    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "uniBridgeCall")

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.navigationDelegate = self
        view.addSubview(webView)

        if let url = URL(string: "https://your-h5-page") {
            webView.load(URLRequest(url: url))
        }
    }
}
```

### 2. 实现 `WKScriptMessageHandler`

```swift
extension WebBridgeViewController {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "uniBridgeCall",
              let body = message.body as? String else {
            return
        }
        handleUniBridgeCall(message: body)
    }
}
```

## 处理 `uniBridgeCall`

```swift
private func handleUniBridgeCall(message: String) {
    guard let data = message.data(using: .utf8),
          let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let type = payload["type"] as? String else {
        return
    }

    let requestData = payload["data"] as? [String: Any] ?? [:]
    let callbackName = payload["callbackName"] as? String

    switch type {
    case "close-page":
        // send，无需响应
        navigationController?.popViewController(animated: true)

    case "log-event":
        let name = requestData["name"] as? String ?? ""
        Analytics.log(name, parameters: requestData)

    case "get-user-info":
        // request，必须响应
        let response: [String: Any] = [
            "errcode": 0,
            "errmsg": "ok",
            "data": ["id": 42, "name": "Alice"]
        ]
        sendResponse(response, to: callbackName)

    case "ios-app-prepay":
        let result = performInAppPurchase(parseIOSPrepay(requestData))
        sendResponse(result, to: callbackName)

    default:
        let error: [String: Any] = ["errcode": -1, "errmsg": "unknown protocol: \(type)"]
        sendResponse(error, to: callbackName)
    }
}

private func sendResponse(_ response: [String: Any], to callbackName: String?) {
    guard let callbackName = callbackName,
          let jsonData = try? JSONSerialization.data(withJSONObject: response),
          let jsonString = String(data: jsonData, encoding: .utf8) else {
        return
    }

    let js = "window['\(callbackName)']('\(jsonString.replacingOccurrences(of: "'", with: "\\'"))');"
    webView.evaluateJavaScript(js, completionHandler: nil)
}
```

## 注意事项

- Handler 名称必须精确为 `uniBridgeCall`。
- 仅当 `callbackName` 存在时才响应（即 `request` 调用）。
- 必须将 JSON 字符串传递给对应的全局回调函数。
- 构造 JavaScript 调用时需要正确转义。
- Handler 可能在页面加载前后注册，JS 侧会持续轮询。
- 将所有输入数据视为不可信。

## 最小完整示例

```swift
class WebBridgeViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "uniBridgeCall")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        // 添加约束...

        if let url = URL(string: "https://your-h5.example.com") {
            webView.load(URLRequest(url: url))
        }
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "uniBridgeCall",
              let body = message.body as? String else { return }
        handleUniBridgeCall(message: body)
    }

    // handleUniBridgeCall 和 sendResponse 实现如上...
}
```

## 调试建议

- 使用 Safari Web Inspector（开发 → 模拟器）检查 `window.webkit.messageHandlers`。
- 在 Web 侧和原生侧都增加日志，记录收到的 `type`。
- 确认当存在 `callbackName` 时正确调用并传入合法 JSON。

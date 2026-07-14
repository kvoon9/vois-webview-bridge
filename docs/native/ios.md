---
title: Native Preparation — iOS
description: Native implementation guide for iOS WKWebView + uniBridgeCall
sidebar:
  label: iOS
  order: 22
---




This page explains how to handle bridge messages on iOS using `WKWebView`.

## Overview

On iOS, the JavaScript side communicates using:

```js
window.webkit.messageHandlers.uniBridgeCall.postMessage(jsonString)
```

- The message handler name **must** be exactly `uniBridgeCall`.
- For `request` calls, a `callbackName` is included in the payload.
- To respond, evaluate JavaScript: `window[callbackName](jsonResponseString)`

The JS side polls for the existence of the handler (no `ready` event is fired by the system).

## Basic Setup

### 1. Create the WKWebView and Register the Script Message Handler

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

### 2. Implement `WKScriptMessageHandler`

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

## Handling `uniBridgeCall`

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
        // send — no response
        navigationController?.popViewController(animated: true)

    case "log-event":
        let name = requestData["name"] as? String ?? ""
        Analytics.log(name, parameters: requestData)
        // No response for send

    case "get-user-info":
        // request — must respond
        let response: [String: Any] = [
            "errcode": 0,
            "errmsg": "ok",
            "data": [
                "id": 42,
                "name": "Alice",
                "avatar": "https://..."
            ]
        ]
        sendResponse(response, to: callbackName)

    case "ios-app-prepay":
        let prepay = parseIOSPrepay(requestData)
        let result = performInAppPurchase(prepay)
        sendResponse(result, to: callbackName)

    default:
        let error: [String: Any] = [
            "errcode": -1,
            "errmsg": "unknown protocol: \(type)"
        ]
        sendResponse(error, to: callbackName)
    }
}

private func sendResponse(_ response: [String: Any], to callbackName: String?) {
    guard let callbackName = callbackName else { return }

    guard let jsonData = try? JSONSerialization.data(withJSONObject: response),
          let jsonString = String(data: jsonData, encoding: .utf8) else {
        return
    }

    let js = "window['\(callbackName)']('\(jsonString.replacingOccurrences(of: "'", with: "\\'"))');"
    webView.evaluateJavaScript(js, completionHandler: nil)
}
```

## Important Details

- The handler name must be **exactly** `uniBridgeCall`.
- Only call `sendResponse` when `callbackName` exists (i.e., `request` calls).
- Always respond with a **JSON string** passed to the global callback function.
- Escape the JSON string properly when building the JavaScript call.
- The message handler may be registered before or after the page loads; the JS side will poll until it appears.
- Treat all incoming data as untrusted input.

## Full Minimal Example

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

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

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

    // handleUniBridgeCall + sendResponse implementations as above...
}
```

## Testing Tips

- Use Safari Web Inspector (Develop → your simulator) to inspect `window.webkit.messageHandlers`.
- Add `console.log` on the web side and native logging for the received `type`.
- Verify that `callbackName` (if present) is invoked with valid JSON.

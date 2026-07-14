---
title: Native Preparation — Android
description: Native implementation guide for Android WebView + WebViewJavascriptBridge
sidebar:
  label: Android
  order: 21
---


This page explains how to integrate the bridge on the Android side using the popular [lzyzsd/JsBridge](https://github.com/lzyzsd/JsBridge) library (or a compatible fork).

## Recommended Library

- **GitHub**: https://github.com/lzyzsd/JsBridge
- The library follows the classic `WebViewJavascriptBridge` interface.
- It automatically injects the bridge JavaScript and fires the `WebViewJavascriptBridgeReady` event.

Add the dependency (via JitPack):

```groovy
// settings.gradle or build.gradle (project)
repositories {
    maven { url 'https://jitpack.io' }
}

// app/build.gradle
dependencies {
    implementation 'com.github.lzyzsd:jsbridge:1.0.4' // check for latest release
}
```

Use `BridgeWebView` (recommended) or integrate the bridge with a standard `WebView`.

## Overview

All communication uses the handler name **`uniBridgeCall`**.

**Direction:**

- JavaScript calls native via `WebViewJavascriptBridge.callHandler('uniBridgeCall', jsonString, responseCallback)`
- Native registers a handler to receive it and replies using the callback when needed.

## Basic Setup

### 1. Layout

```xml
<com.github.lzyzsd.jsbridge.BridgeWebView
    android:id="@+id/webView"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />
```

### 2. Register the Handler

In your Activity / Fragment:

```kotlin
import com.github.lzyzsd.jsbridge.BridgeHandler
import com.github.lzyzsd.jsbridge.BridgeWebView
import com.github.lzyzsd.jsbridge.CallBackFunction

class MyWebViewActivity : AppCompatActivity() {

    private lateinit var webView: BridgeWebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_web)

        webView = findViewById(R.id.webView)
        setupBridge()
        webView.loadUrl("https://your-h5-page.example.com")
    }

    private fun setupBridge() {
        webView.settings.javaScriptEnabled = true

        // Register handler for uniBridgeCall — this is how JS sends data to native
        webView.registerHandler("uniBridgeCall", object : BridgeHandler {
            override fun handler(data: String?, function: CallBackFunction?) {
                if (data != null && function != null) {
                    handleUniBridgeCall(data, function)
                }
            }
        })
    }
}
```

Kotlin lambda style (common in practice):

```kotlin
webView.registerHandler("uniBridgeCall") { data, callback ->
    if (data != null && callback != null) {
        handleUniBridgeCall(data, callback)
    }
}
```

The `data` parameter is the **JSON string** sent from JavaScript.

## Handling `uniBridgeCall`

```kotlin
private fun handleUniBridgeCall(message: String, callback: CallBackFunction) {
    val payload = JSONObject(message)
    val type = payload.optString("type")
    val data = payload.optJSONObject("data") ?: JSONObject()

    when (type) {
        "close-page" -> {
            // send (fire-and-forget) — no need to call callback
            finish()
        }

        "log-event" -> {
            val eventName = data.optString("name")
            Analytics.log(eventName, data)
            // send: do not call callback
        }

        "get-user-info" -> {
            // request: must reply using callback
            val userInfo = JSONObject().apply {
                put("id", 42)
                put("name", "Alice")
            }
            val response = JSONObject().apply {
                put("errcode", 0)
                put("errmsg", "ok")
                put("data", userInfo)
            }
            callback.onCallBack(response.toString())
        }

        "wechat-app-prepay" -> {
            val prepay = parseWechatPrepay(data)
            val result = performWechatPay(prepay)
            callback.onCallBack(result.toString())
        }

        else -> {
            val error = JSONObject().apply {
                put("errcode", -1)
                put("errmsg", "unknown protocol: $type")
            }
            callback.onCallBack(error.toString())
        }
    }
}
```

## Important Details

- `data` received by the handler is a **JSON string**.
- Call `callback.onCallBack(jsonString)` **only** for calls that expect a response (`request` from the JS side). For `send` calls the callback may be null — do nothing.
- Always reply with a **JSON string** (never a Kotlin object).
- Treat all incoming data as untrusted.
- Use stable `type` strings.
- Return business errors inside the response payload (`errcode != 0`) instead of throwing.

## Full Minimal Example (Kotlin)

```kotlin
class MyWebViewActivity : AppCompatActivity() {

    private lateinit var webView: BridgeWebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_web)

        webView = findViewById(R.id.webView)
        setupBridge()
        webView.loadUrl("https://your-h5-page.example.com")
    }

    private fun setupBridge() {
        webView.settings.javaScriptEnabled = true

        webView.registerHandler("uniBridgeCall") { data, callback ->
            if (data != null && callback != null) {
                handleUniBridgeCall(data, callback)
            }
        }
    }

    private fun handleUniBridgeCall(message: String, callback: CallBackFunction) {
        val payload = JSONObject(message)
        val type = payload.optString("type")
        val data = payload.optJSONObject("data") ?: JSONObject()

        when (type) {
            "close-page" -> finish()

            "get-user-info" -> {
                val response = JSONObject().apply {
                    put("errcode", 0)
                    put("errmsg", "ok")
                    put("data", JSONObject().apply {
                        put("id", 42)
                        put("name", "Alice")
                    })
                }
                callback.onCallBack(response.toString())
            }

            // handle other protocols...
            else -> {
                val error = JSONObject().apply {
                    put("errcode", -1)
                    put("errmsg", "unknown protocol: $type")
                }
                callback.onCallBack(error.toString())
            }
        }
    }
}
```

See the official examples in the [lzyzsd/JsBridge](https://github.com/lzyzsd/JsBridge) repository for more patterns (including Java versions and `setDefaultHandler`).

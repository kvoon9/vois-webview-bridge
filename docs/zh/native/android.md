---
title: 原生端准备 — Android
description: Android WebView + WebViewJavascriptBridge 原生实现指南
sidebar:
  label: Android
  order: 21
---




本文档介绍如何在 Android 端使用流行的 [lzyzsd/JsBridge](https://github.com/lzyzsd/JsBridge) 库（或兼容的 fork）集成桥接。

## 推荐库

- **GitHub**: https://github.com/lzyzsd/JsBridge
- 该库遵循经典的 `WebViewJavascriptBridge` 接口。
- 它会自动注入桥接 JS 并派发 `WebViewJavascriptBridgeReady` 事件。

添加依赖（通过 JitPack）：

```groovy
// settings.gradle 或 build.gradle（项目级）
repositories {
    maven { url 'https://jitpack.io' }
}

// app/build.gradle
dependencies {
    implementation 'com.github.lzyzsd:jsbridge:1.0.4' // 请检查最新版本
}
```

推荐使用 `BridgeWebView`，也可以配合普通 `WebView` 使用。

## 概述

所有通信都使用 handler 名称 **`uniBridgeCall`**。

**通信方向：**

- JS 通过 `WebViewJavascriptBridge.callHandler('uniBridgeCall', jsonString, responseCallback)` 调用原生
- 原生通过注册 handler 接收消息，需要响应时通过 callback 回传

## 基础设置

### 1. 布局文件

```xml
<com.github.lzyzsd.jsbridge.BridgeWebView
    android:id="@+id/webView"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />
```

### 2. 注册 Handler

在 Activity / Fragment 中：

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

        // 注册 uniBridgeCall handler，JS 就是通过它把数据发给原生的
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

Kotlin 更常见的 lambda 写法：

```kotlin
webView.registerHandler("uniBridgeCall") { data, callback ->
    if (data != null && callback != null) {
        handleUniBridgeCall(data, callback)
    }
}
```

`data` 参数是 JS 发过来的 **JSON 字符串**。

## 处理 `uniBridgeCall`

```kotlin
private fun handleUniBridgeCall(message: String, callback: CallBackFunction) {
    val payload = JSONObject(message)
    val type = payload.optString("type")
    val data = payload.optJSONObject("data") ?: JSONObject()

    when (type) {
        "close-page" -> {
            // send（单向）：不需要调用 callback
            finish()
        }

        "log-event" -> {
            val eventName = data.optString("name")
            Analytics.log(eventName, data)
            // send：不要调用 callback
        }

        "get-user-info" -> {
            // request：必须通过 callback 响应
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

        "wechat-app-prepay" -> {
            val result = performWechatPay(parseWechatPrepay(data))
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

## 注意事项

- Handler 收到的 `data` 是 **JSON 字符串**。
- 只有 JS 使用 `request()` 发起的调用才需要调用 `callback.onCallBack(jsonString)`。`send()` 调用时 callback 可能为 null，不要调用。
- 必须回复 **JSON 字符串**，而不是 Kotlin 对象。
- 将所有输入数据视为不可信。
- 保持 `type` 字符串稳定。
- 业务错误请通过响应中的 `errcode` 返回，而不是抛异常。

## 最小完整示例（Kotlin）

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

            // 处理其他协议...
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

更多示例请参考 [lzyzsd/JsBridge](https://github.com/lzyzsd/JsBridge) 仓库中的官方例子（包含 Java 版本和 `setDefaultHandler` 用法）。

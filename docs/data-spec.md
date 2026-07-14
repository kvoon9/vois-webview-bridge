---
title: Data Spec
description: JSON message format between Web and Native
sidebar:
  order: 2
---


This document describes the data format exchanged over the `uniBridgeCall` bridge.

The goal is simple: make it clear what **JS sends to native**, and how **native replies with data**.

## Message from JS to Native

Every call from JavaScript sends a JSON object with this shape:

```json
{
  "type": "string",
  "data": {}
}
```

### Fields

| Field  | Description                                                    |
| ------ | -------------------------------------------------------------- |
| `type` | Protocol name, e.g. `close-page`, `get-user-info`, `log-event` |
| `data` | Payload. Always an object (use `{}` when no data is needed)    |

For calls that need a response (library `request()`), iOS also includes a `callbackName`. Android does not use this field — the response is delivered through the callHandler callback instead.

### Examples

**Simple send (no response expected)**

```json
{ "type": "close-page", "data": {} }
```

**Send with payload**

```json
{
  "type": "log-event",
  "data": { "name": "page_view", "page": "/home" }
}
```

**Call that expects a response**

```json
{
  "type": "get-user-info",
  "data": { "userId": 42 }
}
```

(On iOS a `callbackName` field will also be present for response delivery.)

## Reply from Native to JS

When JS uses `request()` (i.e. expects a reply), native **must** return a JSON string.

### Recommended response format

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "data": {}
}
```

### Examples

**Success**

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "data": { "name": "Alice", "id": 42 }
}
```

**Business error (still a successful bridge call)**

```json
{
  "errcode": 1001,
  "errmsg": "insufficient balance",
  "data": null
}
```

## How native delivers the reply

- **Android**: Call the response callback that was passed when you registered the `uniBridgeCall` handler: `callback.onCallBack(jsonString)`
- **iOS**: Call the global function whose name was provided in `callbackName`: `window[callbackName](jsonString)`

The JS side parses the string as JSON. If parsing fails, the promise rejects with a protocol error. Business errors (`errcode != 0`) are returned as resolved values — the bridge call itself succeeds.

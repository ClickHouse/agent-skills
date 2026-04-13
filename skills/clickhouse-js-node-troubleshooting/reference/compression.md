# Compression Not Working

> **Applies to:** all versions. Response compression was enabled by default in `< 1.0.0` and **disabled by default since `>= 1.0.0`** — you must explicitly enable it. Request compression has always been opt-in.

Both request and response compression are supported. Only **GZIP** is supported (via zlib).

```js
const client = createClient({
  compression: {
    response: true,
    request: true,
  },
})
```

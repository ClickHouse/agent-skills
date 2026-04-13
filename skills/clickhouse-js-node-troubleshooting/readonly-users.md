# Read-Only User Errors

> **Applies to:** all versions. In `>= 1.0.0`, `compression.response` was changed to **disabled by default** specifically to avoid this confusing error for read-only users. If you are on `< 1.0.0`, response compression was enabled by default and you must explicitly disable it.

**Symptom:** Error when using `compression: { response: true }` with a `readonly=1` user.

**Cause:** Response compression requires the `enable_http_compression` setting, which `readonly=1` users cannot change.

**Fix:** Remove response compression for read-only users:

```js
// Don't do this with a readonly=1 user:
// compression: { response: true }

const client = createClient({
  username: 'my_readonly_user',
  password: '...',
  // compression omitted, or explicitly set to false
})
```

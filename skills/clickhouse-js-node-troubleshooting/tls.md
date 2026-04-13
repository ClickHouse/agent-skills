# TLS / Certificate Errors

> **Requires:** `>= 0.0.8` (basic and mutual TLS support added in 0.0.8). For custom HTTP agent with TLS, see `>= 1.2.0` (`http_agent` option); note that when using a custom agent, the `tls` config option is ignored.

## Basic TLS (CA certificate only)

```js
import fs from 'fs'

const client = createClient({
  url: 'https://<hostname>:<port>',
  username: '<user>',
  password: '<pass>',
  tls: {
    ca_cert: fs.readFileSync('certs/CA.pem'),
  },
})
```

## Mutual TLS (client certificate + key)

```js
const client = createClient({
  url: 'https://<hostname>:<port>',
  username: '<user>',
  tls: {
    ca_cert: fs.readFileSync('certs/CA.pem'),
    cert: fs.readFileSync('certs/client.crt'),
    key: fs.readFileSync('certs/client.key'),
  },
})
```

> **Tip (`>= 1.2.0`):** If you need a custom HTTP(S) agent (e.g., for TLS authorization where the `Authorization` header conflicts), use the `http_agent` option combined with `set_basic_auth_header: false`.

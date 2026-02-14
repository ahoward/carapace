# API Contract: Gatekeeper Middleware

Base URL: `http://localhost:3001`

All responses use the Result Envelope format. Content-Type is always `application/json`.

---

## GET /health

Returns server status.

**Response** `200`:
```json
{
  "status": "success",
  "result": {
    "mode": "LOCAL",
    "uptime_ms": 12345
  },
  "errors": null,
  "meta": { "path": "/health", "timestamp": "...", "duration_ms": 0 }
}
```

---

## POST /control/set-mode

Switch between LOCAL and CLOUD mode.

**Request body**:
```json
{ "mode": "CLOUD" }
```

**Response** `200`:
```json
{
  "status": "success",
  "result": {
    "previous_mode": "LOCAL",
    "current_mode": "CLOUD"
  },
  "errors": null,
  "meta": { "path": "/control/set-mode", "timestamp": "...", "duration_ms": 0 }
}
```

**Error** `400` — invalid mode value:
```json
{
  "status": "error",
  "result": null,
  "errors": { "mode": ["must be LOCAL or CLOUD"] },
  "meta": { "path": "/control/set-mode", "timestamp": "...", "duration_ms": 0 }
}
```

---

## GET /tools/fs/read?path={vault_prefixed_path}

Read a file from a vault. Path must start with `public/` or `private/`.

**Parameters**:
- `path` (query, required): Vault-prefixed relative path, e.g., `public/readme.txt` or `private/secrets.txt`

**Response** `200` (LOCAL mode, any vault; CLOUD mode, public vault only):
```json
{
  "status": "success",
  "result": {
    "path": "public/readme.txt",
    "content": "file contents here",
    "size": 18
  },
  "errors": null,
  "meta": { "path": "/tools/fs/read", "timestamp": "...", "duration_ms": 1 }
}
```

**Error** `403` — private vault access in CLOUD mode:
```json
{
  "status": "error",
  "result": null,
  "errors": { "access": ["private vault access denied in CLOUD mode"] },
  "meta": { "path": "/tools/fs/read", "timestamp": "...", "duration_ms": 0 }
}
```

**Error** `400` — missing path, invalid vault prefix, or traversal attempt:
```json
{
  "status": "error",
  "result": null,
  "errors": { "path": ["must start with public/ or private/"] },
  "meta": { "path": "/tools/fs/read", "timestamp": "...", "duration_ms": 0 }
}
```

**Error** `400` — path traversal detected:
```json
{
  "status": "error",
  "result": null,
  "errors": { "path": ["path traversal detected"] },
  "meta": { "path": "/tools/fs/read", "timestamp": "...", "duration_ms": 0 }
}
```

**Error** `404` — file not found:
```json
{
  "status": "error",
  "result": null,
  "errors": { "path": ["file not found"] },
  "meta": { "path": "/tools/fs/read", "timestamp": "...", "duration_ms": 0 }
}
```

---

## GET /tools/fs/list

List all files in accessible vaults. In CLOUD mode, only public vault entries are returned.

**Response** `200`:
```json
{
  "status": "success",
  "result": {
    "mode": "LOCAL",
    "files": [
      { "name": "public/readme.txt", "kind": "file", "size": 1024 },
      { "name": "public/docs/", "kind": "directory", "size": 0 },
      { "name": "private/secrets.txt", "kind": "file", "size": 256 },
      { "name": "private/keys/", "kind": "directory", "size": 0 }
    ]
  },
  "errors": null,
  "meta": { "path": "/tools/fs/list", "timestamp": "...", "duration_ms": 2 }
}
```

CLOUD mode response (same shape, private entries omitted):
```json
{
  "status": "success",
  "result": {
    "mode": "CLOUD",
    "files": [
      { "name": "public/readme.txt", "kind": "file", "size": 1024 },
      { "name": "public/docs/", "kind": "directory", "size": 0 }
    ]
  },
  "errors": null,
  "meta": { "path": "/tools/fs/list", "timestamp": "...", "duration_ms": 1 }
}
```

---

## Error Responses (all endpoints)

**404** — unknown route:
```json
{
  "status": "error",
  "result": null,
  "errors": { "route": ["not found"] },
  "meta": { "path": "/unknown", "timestamp": "...", "duration_ms": 0 }
}
```

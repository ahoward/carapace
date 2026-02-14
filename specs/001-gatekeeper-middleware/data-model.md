# Data Model: Gatekeeper Middleware

## Types

### Mode

```
"LOCAL" | "CLOUD"
```

Two-value string union. Stored in memory. Defaults to `"LOCAL"` on startup. Changed via `/control/set-mode`.

### ResultEnvelope\<T\>

```
{
  status:     "success" | "error"
  result:     T | null
  errors:     Record<string, string[]> | null
  meta: {
    path:         string       // request pathname
    timestamp:    string       // ISO 8601
    duration_ms:  number       // handler execution time
  }
}
```

Invariants:
- `status === "success"` → `result !== null`, `errors === null`
- `status === "error"` → `result === null`, `errors !== null`
- `meta` always populated

### FileEntry

```
{
  name:     string       // vault-prefixed relative path (e.g., "public/readme.txt")
  kind:     "file" | "directory"
  size:     number       // bytes (0 for directories)
}
```

Note: The `private` boolean from the spike is removed. In the real implementation, vault membership is encoded in the path prefix (`public/` vs `private/`). CLOUD mode simply excludes all `private/` entries.

### HealthResult

```
{
  mode:       Mode
  uptime_ms:  number
}
```

### SetModeResult

```
{
  previous_mode:  Mode
  current_mode:   Mode
}
```

### ReadResult

```
{
  path:     string       // the vault-prefixed path that was read
  content:  string       // UTF-8 file contents
  size:     number       // bytes
}
```

### ListResult

```
{
  mode:   Mode
  files:  FileEntry[]
}
```

## State

| Name | Type | Lifetime | Default |
|------|------|----------|---------|
| `current_mode` | Mode | In-memory, process lifetime | `"LOCAL"` |
| `PUBLIC_VAULT` | string | Env var, read at startup | `"./data/public"` |
| `PRIVATE_VAULT` | string | Env var, read at startup | `"./data/private"` |
| `GATEKEEPER_PORT` | number | Env var, read at startup | `3001` |

No persistent state. No database. Everything resets on process restart.

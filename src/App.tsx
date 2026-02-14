import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

const GATEKEEPER_URL = "http://localhost:3001";

type Mode = "LOCAL" | "CLOUD";
type GatekeeperStatus = "running" | "stopped" | "unknown";

interface FileEntry {
  name: string;
  kind: "file" | "directory";
  size: number;
}

interface ResultEnvelope<T> {
  status: "success" | "error";
  result: T | null;
  errors: Record<string, string[]> | null;
}

function App() {
  const [gk_status, set_gk_status] = useState<GatekeeperStatus>("unknown");
  const [mode, set_mode] = useState<Mode>("LOCAL");
  const [files, set_files] = useState<FileEntry[]>([]);
  const [message, set_message] = useState<string>("");
  const [loading, set_loading] = useState(false);

  const is_tauri = "__TAURI_INTERNALS__" in window;

  const fetch_status = useCallback(async () => {
    if (is_tauri) {
      try {
        const result = await invoke<string>("gatekeeper_status");
        set_gk_status(result as GatekeeperStatus);
      } catch {
        set_gk_status("unknown");
      }
    } else {
      try {
        const response = await fetch(`${GATEKEEPER_URL}/health`);
        if (response.ok) {
          set_gk_status("running");
        } else {
          set_gk_status("stopped");
        }
      } catch {
        set_gk_status("stopped");
      }
    }
  }, [is_tauri]);

  const fetch_files = useCallback(async () => {
    try {
      const response = await fetch(`${GATEKEEPER_URL}/tools/fs/list`);
      const envelope: ResultEnvelope<{ mode: Mode; files: FileEntry[] }> = await response.json();
      if (envelope.status === "success" && envelope.result !== null) {
        set_mode(envelope.result.mode);
        set_files(envelope.result.files);
      }
    } catch {
      set_files([]);
    }
  }, []);

  useEffect(() => {
    fetch_status();
    const interval = setInterval(fetch_status, 2000);
    return () => clearInterval(interval);
  }, [fetch_status]);

  useEffect(() => {
    if (gk_status === "running") {
      fetch_files();
    }
  }, [gk_status, fetch_files]);

  const handle_start = async () => {
    set_loading(true);
    set_message("");
    try {
      if (is_tauri) {
        const result = await invoke<string>("start_gatekeeper");
        set_message(result);
      } else {
        set_message("start gatekeeper manually: bun run gatekeeper/src/index.ts");
      }
      await new Promise((r) => setTimeout(r, 1000));
      await fetch_status();
      await fetch_files();
    } catch (err) {
      set_message(String(err));
    }
    set_loading(false);
  };

  const handle_stop = async () => {
    set_loading(true);
    set_message("");
    try {
      if (is_tauri) {
        const result = await invoke<string>("stop_gatekeeper");
        set_message(result);
      } else {
        set_message("stop gatekeeper manually (ctrl+c the process)");
      }
      await fetch_status();
      set_files([]);
    } catch (err) {
      set_message(String(err));
    }
    set_loading(false);
  };

  const handle_toggle_mode = async () => {
    const new_mode: Mode = mode === "LOCAL" ? "CLOUD" : "LOCAL";
    try {
      const response = await fetch(`${GATEKEEPER_URL}/control/set-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: new_mode }),
      });
      const envelope: ResultEnvelope<{ current_mode: Mode }> = await response.json();
      if (envelope.status === "success" && envelope.result !== null) {
        set_mode(envelope.result.current_mode);
        await fetch_files();
      }
    } catch (err) {
      set_message(String(err));
    }
  };

  return (
    <main>
      <h1>Carapace</h1>
      <p>Phase 0 — Spike</p>

      <div className={`status ${gk_status === "running" ? "running" : "stopped"}`}>
        Gatekeeper: {gk_status}
      </div>

      <div className="controls">
        <button type="button" onClick={handle_start} disabled={loading || gk_status === "running"}>
          Start Gatekeeper
        </button>
        <button type="button" onClick={handle_stop} disabled={loading || gk_status !== "running"}>
          Stop Gatekeeper
        </button>
      </div>

      {gk_status === "running" && (
        <>
          <div className="controls">
            <button type="button" onClick={handle_toggle_mode}>
              Switch to {mode === "LOCAL" ? "CLOUD" : "LOCAL"}
            </button>
            <span className="mode-indicator">{mode}</span>
          </div>

          <h2>Files ({files.length})</h2>
          <ul className="file-list">
            {files.map((f) => (
              <li key={f.name}>
                {f.kind === "directory" ? "📁" : "📄"} {f.name}
                {f.kind === "file" ? ` (${f.size}B)` : ""}
                {f.name.startsWith("private/") ? " 🔒" : ""}
              </li>
            ))}
          </ul>
        </>
      )}

      {message && (
        <p>
          <code>{message}</code>
        </p>
      )}
    </main>
  );
}

export default App;

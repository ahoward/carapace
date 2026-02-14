import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type FileEntry,
  type Mode,
  type ResultEnvelope,
  check_health,
  fetch_file_list,
  shutdown as gk_shutdown,
  set_mode as set_gk_mode,
} from "./lib/gatekeeper_client";
import { PLAYBOOK_STEPS, type PlaybookStep, build_qa_report } from "./lib/playbook";

const GATEKEEPER_URL = "http://localhost:3001";

type GatekeeperStatus = "running" | "stopped" | "unknown";
type LogLevel = "info" | "error" | "warn";

interface LogEntry {
  time: string;
  level: LogLevel;
  message: string;
}

interface OpEntry {
  time: string;
  message: string;
}

const MAX_ENTRIES = 100;

function format_time(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function log_level_for_envelope(envelope: ResultEnvelope<unknown>): LogLevel {
  return envelope.status === "success" ? "info" : "error";
}

function App() {
  const [gk_status, set_gk_status] = useState<GatekeeperStatus>("unknown");
  const [mode, set_mode] = useState<Mode>("LOCAL");
  const [files, set_files] = useState<FileEntry[]>([]);
  const [message, set_message] = useState<string>("");
  const [loading, set_loading] = useState(false);
  const [logs, set_logs] = useState<LogEntry[]>([]);
  const [ops, set_ops] = useState<OpEntry[]>([]);
  const [checks, set_checks] = useState<Record<string, boolean>>({});
  const [debug_open, set_debug_open] = useState(true);
  const [oplog_open, set_oplog_open] = useState(true);
  const [playbook_open, set_playbook_open] = useState(true);
  const [copied, set_copied] = useState(false);

  const is_tauri = "__TAURI_INTERNALS__" in window;

  const add_log = useCallback((level: LogLevel, message: string) => {
    set_logs((prev) => {
      const entry: LogEntry = { time: format_time(), level, message };
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
  }, []);

  const add_op = useCallback((message: string) => {
    set_ops((prev) => {
      const entry: OpEntry = { time: format_time(), message };
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
  }, []);

  const fetch_status = useCallback(async () => {
    if (is_tauri) {
      try {
        const result = await invoke<string>("gatekeeper_status");
        set_gk_status(result as GatekeeperStatus);
        add_log("info", `tauri gatekeeper_status → ${result}`);
      } catch (err) {
        set_gk_status("unknown");
        add_log("error", `tauri gatekeeper_status → ${err}`);
      }
    } else {
      const envelope = await check_health(GATEKEEPER_URL);
      const level = log_level_for_envelope(envelope);
      if (envelope.status === "success") {
        set_gk_status("running");
        add_log(
          level,
          `GET /health → ${envelope.result?.mode} uptime=${envelope.result?.uptime_ms}ms`,
        );
      } else {
        set_gk_status("stopped");
        const err_msg = envelope.errors
          ? Object.values(envelope.errors).flat().join(", ")
          : "unknown error";
        add_log(level, `GET /health → ${err_msg}`);
      }
    }
  }, [is_tauri, add_log]);

  const fetch_files = useCallback(async () => {
    const envelope = await fetch_file_list(GATEKEEPER_URL);
    const level = log_level_for_envelope(envelope);
    if (envelope.status === "success" && envelope.result !== null) {
      set_mode(envelope.result.mode);
      set_files(envelope.result.files);
      add_log(
        level,
        `GET /tools/fs/list → ${envelope.result.files.length} files (${envelope.result.mode})`,
      );
    } else {
      set_files([]);
      const err_msg = envelope.errors
        ? Object.values(envelope.errors).flat().join(", ")
        : "unknown error";
      add_log(level, `GET /tools/fs/list → ${err_msg}`);
    }
  }, [add_log]);

  useEffect(() => {
    add_log("info", "app started, polling gatekeeper...");
    fetch_status();
    const interval = setInterval(fetch_status, 2000);
    return () => clearInterval(interval);
  }, [fetch_status, add_log]);

  useEffect(() => {
    if (gk_status === "running") {
      fetch_files();
    }
  }, [gk_status, fetch_files]);

  const handle_start = async () => {
    add_op("clicked Start Gatekeeper");
    set_loading(true);
    set_message("");
    try {
      if (is_tauri) {
        const result = await invoke<string>("start_gatekeeper");
        set_message(result);
        add_log("info", `start_gatekeeper → ${result}`);
      } else {
        const msg = "start gatekeeper manually: bun run gatekeeper/src/index.ts";
        set_message(msg);
        add_log("warn", msg);
      }
      await new Promise((r) => setTimeout(r, 1000));
      await fetch_status();
      await fetch_files();
    } catch (err) {
      set_message(String(err));
      add_log("error", `start_gatekeeper → ${err}`);
    }
    set_loading(false);
  };

  const handle_stop = async () => {
    add_op("clicked Stop Gatekeeper");
    set_loading(true);
    set_message("");
    try {
      if (is_tauri) {
        const result = await invoke<string>("stop_gatekeeper");
        set_message(result);
        add_log("info", `stop_gatekeeper → ${result}`);
      } else {
        add_log("info", "POST /control/shutdown → requesting");
        const envelope = await gk_shutdown(GATEKEEPER_URL);
        if (envelope.status === "success") {
          add_log("info", "POST /control/shutdown → gatekeeper shutting down");
        } else {
          const err_msg = envelope.errors
            ? Object.values(envelope.errors).flat().join(", ")
            : "unknown error";
          add_log("error", `POST /control/shutdown → ${err_msg}`);
        }
      }
      await new Promise((r) => setTimeout(r, 500));
      await fetch_status();
      set_files([]);
    } catch (err) {
      set_message(String(err));
      add_log("error", `stop_gatekeeper → ${err}`);
    }
    set_loading(false);
  };

  const handle_toggle_mode = async () => {
    const new_mode: Mode = mode === "LOCAL" ? "CLOUD" : "LOCAL";
    add_op(`clicked Switch to ${new_mode}`);
    add_log("info", `POST /control/set-mode → requesting ${new_mode}`);
    const envelope = await set_gk_mode(GATEKEEPER_URL, new_mode);
    const level = log_level_for_envelope(envelope);
    if (envelope.status === "success" && envelope.result !== null) {
      set_mode(envelope.result.current_mode);
      add_log(
        level,
        `POST /control/set-mode → ${envelope.result.previous_mode} → ${envelope.result.current_mode}`,
      );
      await fetch_files();
    } else {
      const err_msg = envelope.errors
        ? Object.values(envelope.errors).flat().join(", ")
        : "unknown error";
      set_message(err_msg);
      add_log(level, `POST /control/set-mode → ${err_msg}`);
    }
  };

  const handle_copy_report = async () => {
    add_op("clicked Copy QA Report");
    const report = build_qa_report(checks, ops, logs);
    await navigator.clipboard.writeText(report);
    set_copied(true);
    setTimeout(() => set_copied(false), 2000);
  };

  const toggle_check = (id: string) => {
    set_checks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <main>
      <h1>Carapace</h1>
      <p>Phase 1A — Gatekeeper</p>

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
                {f.kind === "directory" ? "\u{1F4C1}" : "\u{1F4C4}"} {f.name}
                {f.kind === "file" ? ` (${f.size}B)` : ""}
                {f.name.startsWith("private/") ? " \u{1F512}" : ""}
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

      <div className="qa-panels">
        <button type="button" className="copy-qa-btn" onClick={handle_copy_report}>
          {copied ? "Copied!" : "Copy QA Report"}
        </button>

        <PlaybookPanel
          steps={PLAYBOOK_STEPS}
          checks={checks}
          on_toggle_check={toggle_check}
          open={playbook_open}
          on_toggle={() => set_playbook_open(!playbook_open)}
        />

        <OpLogPanel entries={ops} open={oplog_open} on_toggle={() => set_oplog_open(!oplog_open)} />

        <DebugPanel logs={logs} open={debug_open} on_toggle={() => set_debug_open(!debug_open)} />
      </div>
    </main>
  );
}

function PlaybookPanel({
  steps,
  checks,
  on_toggle_check,
  open,
  on_toggle,
}: {
  steps: PlaybookStep[];
  checks: Record<string, boolean>;
  on_toggle_check: (id: string) => void;
  open: boolean;
  on_toggle: () => void;
}) {
  const done = steps.filter((s) => checks[s.id]).length;
  return (
    <div className="playbook-panel">
      <button type="button" className="panel-toggle" onClick={on_toggle}>
        {open ? "\u25BC" : "\u25B6"} Playbook ({done}/{steps.length})
      </button>
      {open && (
        <div className="playbook-list">
          {steps.map((step) => (
            <label key={step.id} className="playbook-step">
              <input
                type="checkbox"
                checked={!!checks[step.id]}
                onChange={() => on_toggle_check(step.id)}
              />
              <div className="playbook-step-body">
                <strong>{step.title}</strong>
                <span className="playbook-instruction">{step.instruction}</span>
                <span className="playbook-expected">Expect: {step.expected}</span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function OpLogPanel({
  entries,
  open,
  on_toggle,
}: {
  entries: OpEntry[];
  open: boolean;
  on_toggle: () => void;
}) {
  const container_ref = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on entry change
  useEffect(() => {
    const el = container_ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div className="oplog-panel">
      <button type="button" className="panel-toggle" onClick={on_toggle}>
        {open ? "\u25BC" : "\u25B6"} Op Log ({entries.length})
      </button>
      {open && (
        <div className="oplog-entries" ref={container_ref}>
          {entries.map((entry, i) => (
            <div key={`${entry.time}-${i}`} className="oplog-entry">
              <span className="oplog-time">[{entry.time}]</span> {entry.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DebugPanel({
  logs,
  open,
  on_toggle,
}: {
  logs: LogEntry[];
  open: boolean;
  on_toggle: () => void;
}) {
  const log_container_ref = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on log change
  useEffect(() => {
    const el = log_container_ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="debug-panel">
      <button type="button" className="panel-toggle" onClick={on_toggle}>
        {open ? "\u25BC" : "\u25B6"} Debug ({logs.length})
      </button>
      {open && (
        <div className="debug-log" ref={log_container_ref}>
          {logs.map((entry, i) => (
            <div key={`${entry.time}-${i}`} className={`debug-entry debug-${entry.level}`}>
              <span className="debug-time">[{entry.time}]</span> {entry.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;

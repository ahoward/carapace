import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClusterStatus, ProvisioningEvent } from "../gatekeeper/src/types";
import {
  type ClusterStatusResult,
  cluster_destroy,
  cluster_launch,
  cluster_status,
  cluster_stop,
} from "./lib/cluster_client";
import {
  type FileEntry,
  type Mode,
  type ResultEnvelope,
  check_health,
  fetch_file_list,
  shutdown as gk_shutdown,
  set_mode as set_gk_mode,
} from "./lib/gatekeeper_client";
import {
  PLAYBOOK_STEPS,
  type PlaybookStep,
  type StepResult,
  build_qa_report,
} from "./lib/playbook";

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
  const [results, set_results] = useState<Record<string, StepResult>>({});
  const [debug_open, set_debug_open] = useState(true);
  const [oplog_open, set_oplog_open] = useState(true);
  const [playbook_open, set_playbook_open] = useState(true);
  const [copied, set_copied] = useState(false);

  // ── Cluster state (Phase 1B) ──
  const [cluster_info, set_cluster_info] = useState<ClusterStatusResult | null>(null);
  const [cluster_loading, set_cluster_loading] = useState(false);
  const sse_ref = useRef<EventSource | null>(null);

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

  // ── Cluster status polling (T020) ──
  const fetch_cluster_status = useCallback(async () => {
    if (gk_status !== "running") return;
    const envelope = await cluster_status(GATEKEEPER_URL);
    if (envelope.status === "success" && envelope.result) {
      set_cluster_info(envelope.result);
    }
  }, [gk_status]);

  useEffect(() => {
    if (gk_status !== "running") return;
    fetch_cluster_status();
    // Polling interval: 15s during transitions, 30s steady-state
    const cs = cluster_info?.status;
    const interval_ms =
      cs === "provisioning" || cs === "stopping" || cs === "destroying" ? 15000 : 30000;
    const interval = setInterval(fetch_cluster_status, interval_ms);
    return () => clearInterval(interval);
  }, [gk_status, fetch_cluster_status, cluster_info?.status]);

  // ── SSE event stream connection ──
  useEffect(() => {
    if (gk_status !== "running") {
      if (sse_ref.current) {
        sse_ref.current.close();
        sse_ref.current = null;
      }
      return;
    }

    const es = new EventSource(`${GATEKEEPER_URL}/cluster/events`);
    sse_ref.current = es;

    const handle_event = (e: MessageEvent) => {
      try {
        const event: ProvisioningEvent = JSON.parse(e.data);
        add_log(event.type === "error" ? "error" : "info", `[cluster] ${event.message}`);
      } catch {
        // ignore parse errors
      }
    };

    es.addEventListener("progress", handle_event);
    es.addEventListener("complete", handle_event);
    es.addEventListener("error", (e) => {
      if (es.readyState === EventSource.CLOSED) {
        sse_ref.current = null;
      }
    });

    return () => {
      es.close();
      sse_ref.current = null;
    };
  }, [gk_status, add_log]);

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

  // ── Cluster actions (Phase 1B) ──
  const handle_launch_server = async () => {
    add_op("clicked Launch Server");
    set_cluster_loading(true);
    add_log("info", "POST /cluster/launch → requesting");
    const envelope = await cluster_launch(GATEKEEPER_URL);
    if (envelope.status === "success") {
      add_log("info", `POST /cluster/launch → ${envelope.result?.message}`);
    } else {
      const err = envelope.errors
        ? Object.values(envelope.errors).flat().join(", ")
        : "unknown error";
      add_log("error", `POST /cluster/launch → ${err}`);
    }
    await fetch_cluster_status();
    set_cluster_loading(false);
  };

  const handle_stop_server = async () => {
    add_op("clicked Stop Server");
    set_cluster_loading(true);
    add_log("info", "POST /cluster/stop → requesting");
    const envelope = await cluster_stop(GATEKEEPER_URL);
    if (envelope.status === "success") {
      add_log("info", `POST /cluster/stop → ${envelope.result?.message}`);
    } else {
      const err = envelope.errors
        ? Object.values(envelope.errors).flat().join(", ")
        : "unknown error";
      add_log("error", `POST /cluster/stop → ${err}`);
    }
    await fetch_cluster_status();
    set_cluster_loading(false);
  };

  const handle_destroy_server = async () => {
    if (!confirm("Destroy the cloud server? This removes all cloud resources.")) return;
    add_op("clicked Destroy Server");
    set_cluster_loading(true);
    add_log("info", "POST /cluster/destroy → requesting");
    const envelope = await cluster_destroy(GATEKEEPER_URL);
    if (envelope.status === "success") {
      add_log("info", `POST /cluster/destroy → ${envelope.result?.message}`);
    } else {
      const err = envelope.errors
        ? Object.values(envelope.errors).flat().join(", ")
        : "unknown error";
      add_log("error", `POST /cluster/destroy → ${err}`);
    }
    await fetch_cluster_status();
    set_cluster_loading(false);
  };

  const handle_copy_report = async () => {
    add_op("clicked Copy QA Report");
    const report = build_qa_report(results, ops, logs);
    await navigator.clipboard.writeText(report);
    set_copied(true);
    setTimeout(() => set_copied(false), 2000);
  };

  const mark_step = (id: string, result: StepResult) => {
    add_op(`marked "${PLAYBOOK_STEPS.find((s) => s.id === id)?.title}" as ${result.toUpperCase()}`);
    set_results((prev) => ({ ...prev, [id]: result }));
  };

  // current step = first step that is still pending
  const current_step_id =
    PLAYBOOK_STEPS.find((s) => (results[s.id] ?? "pending") === "pending")?.id ?? null;

  return (
    <main>
      <h1>Carapace</h1>
      <p>Phase 1B — SkyPilot Provisioning</p>

      <div className={`status ${gk_status === "running" ? "running" : "stopped"}`}>
        Gatekeeper: {gk_status}
      </div>

      {gk_status === "running" && (
        <ClusterPanel
          info={cluster_info}
          loading={cluster_loading}
          on_launch={handle_launch_server}
          on_stop={handle_stop_server}
          on_destroy={handle_destroy_server}
        />
      )}

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
          results={results}
          current_step_id={current_step_id}
          on_mark={mark_step}
          open={playbook_open}
          on_toggle={() => set_playbook_open(!playbook_open)}
        />

        <OpLogPanel entries={ops} open={oplog_open} on_toggle={() => set_oplog_open(!oplog_open)} />

        <DebugPanel logs={logs} open={debug_open} on_toggle={() => set_debug_open(!debug_open)} />
      </div>
    </main>
  );
}

// ── Cluster status panel (Phase 1B) ──

const CLUSTER_STATUS_COLORS: Record<ClusterStatus, string> = {
  no_server: "cluster-none",
  provisioning: "cluster-transitioning",
  running: "cluster-running",
  stopping: "cluster-transitioning",
  stopped: "cluster-stopped",
  destroying: "cluster-transitioning",
  error: "cluster-error",
};

function ClusterPanel({
  info,
  loading,
  on_launch,
  on_stop,
  on_destroy,
}: {
  info: ClusterStatusResult | null;
  loading: boolean;
  on_launch: () => void;
  on_stop: () => void;
  on_destroy: () => void;
}) {
  const status = info?.status ?? "no_server";
  const color_class = CLUSTER_STATUS_COLORS[status];
  const is_transitioning =
    status === "provisioning" || status === "stopping" || status === "destroying";

  return (
    <div className="cluster-panel">
      <h2>Cloud Server</h2>
      <div className={`cluster-status ${color_class}`}>
        {is_transitioning && <span className="cluster-spinner" />}
        {status.replace("_", " ")}
      </div>

      {info?.ip && (
        <div className="cluster-ip">
          IP: <code>{info.ip}</code>
        </div>
      )}

      {info?.error && (
        <div className="cluster-error-msg">
          <code>{info.error}</code>
        </div>
      )}

      {info?.cloud && (
        <div className="cluster-detail">
          {info.cloud}
          {info.region ? ` / ${info.region}` : ""}
        </div>
      )}

      {status === "running" && info?.launched_at && (
        <div className="cluster-detail cluster-mounts">Vault files synced at launch</div>
      )}

      <div className="cluster-controls">
        <button
          type="button"
          onClick={on_launch}
          disabled={loading || (status !== "no_server" && status !== "error")}
        >
          Launch Server
        </button>
        <button type="button" onClick={on_stop} disabled={loading || status !== "running"}>
          Stop Server
        </button>
        <button
          type="button"
          className="btn-destroy"
          onClick={on_destroy}
          disabled={loading || !["running", "stopped", "error"].includes(status)}
        >
          Destroy Server
        </button>
      </div>
    </div>
  );
}

function PlaybookPanel({
  steps,
  results,
  current_step_id,
  on_mark,
  open,
  on_toggle,
}: {
  steps: PlaybookStep[];
  results: Record<string, StepResult>;
  current_step_id: string | null;
  on_mark: (id: string, result: StepResult) => void;
  open: boolean;
  on_toggle: () => void;
}) {
  const pass_count = steps.filter((s) => results[s.id] === "pass").length;
  const fail_count = steps.filter((s) => results[s.id] === "fail").length;

  let summary: string;
  if (fail_count > 0) {
    summary = `${pass_count} pass, ${fail_count} fail`;
  } else if (pass_count === steps.length) {
    summary = "all pass";
  } else {
    summary = `${pass_count}/${steps.length}`;
  }

  return (
    <div className="playbook-panel">
      <button type="button" className="panel-toggle" onClick={on_toggle}>
        {open ? "\u25BC" : "\u25B6"} Playbook ({summary})
      </button>
      {open && (
        <div className="playbook-list">
          {steps.map((step) => {
            const r = results[step.id] ?? "pending";
            const is_current = step.id === current_step_id;
            return (
              <div
                key={step.id}
                className={`playbook-step ${is_current ? "playbook-current" : ""} playbook-${r}`}
              >
                <div className="playbook-step-body">
                  <strong>
                    {r === "pass" ? "\u2705" : r === "fail" ? "\u274C" : "\u2022"} {step.title}
                  </strong>
                  <span className="playbook-instruction">{step.instruction}</span>
                  <span className="playbook-expected">Expect: {step.expected}</span>
                </div>
                <div className="playbook-actions">
                  <button
                    type="button"
                    className="step-pass"
                    onClick={() => on_mark(step.id, r === "pass" ? "pending" : "pass")}
                  >
                    {r === "pass" ? "undo" : "pass"}
                  </button>
                  <button
                    type="button"
                    className="step-fail"
                    onClick={() => on_mark(step.id, r === "fail" ? "pending" : "fail")}
                  >
                    {r === "fail" ? "undo" : "fail"}
                  </button>
                </div>
              </div>
            );
          })}
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

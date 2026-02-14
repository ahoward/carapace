/**
 * QA Playbook — pure data, no React/DOM dependencies.
 *
 * Each step describes what the tester should do and what they should see.
 * The UI renders these with PASS / FAIL / skip controls.
 * Tester works through them in order; on first FAIL, copy the report.
 */

export type StepResult = "pass" | "fail" | "pending";

export interface PlaybookStep {
  id: string;
  title: string;
  instruction: string;
  expected: string;
}

export const PLAYBOOK_STEPS: PlaybookStep[] = [
  {
    id: "health",
    title: "Verify health",
    instruction: "Wait for the app to load. Do not click anything.",
    expected: "Status shows 'running', debug panel shows health polls.",
  },
  {
    id: "list-files",
    title: "Verify file listing",
    instruction: "Confirm the Files section appears with entries.",
    expected: "Files list is populated with public/ and private/ entries.",
  },
  {
    id: "toggle-mode",
    title: "Toggle mode",
    instruction: "Click 'Switch to CLOUD'.",
    expected: "Mode indicator changes to CLOUD, files list updates (no private/ files).",
  },
  {
    id: "toggle-back",
    title: "Toggle back",
    instruction: "Click 'Switch to LOCAL'.",
    expected: "Mode indicator changes to LOCAL, private/ files reappear.",
  },
  {
    id: "stop",
    title: "Stop gatekeeper",
    instruction: "Click 'Stop Gatekeeper'.",
    expected: "Status changes to 'stopped', files list disappears.",
  },
  {
    id: "start",
    title: "Restart gatekeeper",
    instruction: "Click 'Start Gatekeeper'.",
    expected: "Status returns to 'running', files list repopulates.",
  },
  // ── Phase 1B: SkyPilot Provisioning ──
  {
    id: "cluster-check",
    title: "Verify cloud server panel",
    instruction: "With gatekeeper running, confirm the Cloud Server panel appears.",
    expected:
      "Cloud Server section shows status 'no server', Launch button enabled, Stop/Destroy disabled.",
  },
  {
    id: "cluster-launch",
    title: "Launch cloud server",
    instruction: "Click 'Launch Server'. (Requires SkyPilot installed + cloud credentials.)",
    expected:
      "Status transitions to 'provisioning' with spinner. Progress events appear in debug panel. After 5-10 min, status shows 'running' with IP address.",
  },
  {
    id: "cluster-status-poll",
    title: "Verify status polling",
    instruction: "With a running server, wait 30 seconds and observe status updates.",
    expected:
      "Status badge stays 'running'. Debug panel shows periodic status polls. No stale state.",
  },
  {
    id: "cluster-stop",
    title: "Stop cloud server",
    instruction: "Click 'Stop Server'.",
    expected:
      "Status transitions to 'stopping', then 'stopped' within 2 minutes. IP disappears. Launch button remains disabled.",
  },
  {
    id: "cluster-destroy",
    title: "Destroy cloud server",
    instruction: "Click 'Destroy Server' and confirm the dialog.",
    expected:
      "Status transitions to 'destroying', then 'no server' within 3 minutes. Launch button re-enabled.",
  },
  {
    id: "cluster-missing-sky",
    title: "Error: missing SkyPilot",
    instruction: "Ensure 'sky' is not in PATH (rename binary). Click 'Launch Server'.",
    expected:
      "Error message about SkyPilot not installed with installation instructions. Status does not change from 'no server'.",
  },
];

/**
 * Build a plain-text QA report for clipboard handoff.
 */
export function build_qa_report(
  results: Record<string, StepResult>,
  op_entries: { time: string; message: string }[],
  debug_entries: { time: string; level: string; message: string }[],
): string {
  const lines: string[] = [];

  lines.push("== QA Report ==");
  lines.push(`Timestamp: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("== Playbook ==");
  for (const step of PLAYBOOK_STEPS) {
    const r = results[step.id] ?? "pending";
    const mark = r === "pass" ? "PASS" : r === "fail" ? "FAIL" : "----";
    lines.push(`[${mark}] ${step.title}`);
    lines.push(`        do: ${step.instruction}`);
    lines.push(`    expect: ${step.expected}`);
  }
  lines.push("");

  lines.push("== Op Log ==");
  for (const entry of op_entries) {
    lines.push(`[${entry.time}] ${entry.message}`);
  }
  lines.push("");

  lines.push("== Debug Log ==");
  for (const entry of debug_entries) {
    lines.push(`[${entry.time}] ${entry.message}`);
  }

  return lines.join("\n");
}

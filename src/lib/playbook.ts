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

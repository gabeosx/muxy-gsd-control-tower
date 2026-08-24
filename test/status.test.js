import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSignals, deriveStatus, hasOpenWork, isComplete, latestChangeMs } from "../src/core/status.js";
import { minutesAgo } from "./helpers.js";

const baseGsd = {
  recognized: true,
  verification: "unknown",
  paused: false,
  progress: { percent: 40 },
  roadmapPhases: [{ number: "1", name: "Core", done: false }],
  frontmatterStatus: "active",
  statusLine: "In progress",
  lastActivity: minutesAgo(5),
  evidence: [{ path: ".planning/STATE.md", observedAt: minutesAgo(5) }],
  errors: [],
};

test("waiting comes only from explicit runtime report (never inferred)", () => {
  const r = deriveStatus({ isGsd: true, gsd: { ...baseGsd }, agent: { runtimeState: "idle" } });
  assert.notEqual(r.controlState, "waiting");
  const w = deriveStatus({ isGsd: true, gsd: { ...baseGsd }, agent: { runtimeState: "waiting", providerId: "codex" } });
  assert.equal(w.controlState, "waiting");
  assert.match(w.statusReason ?? "", /Codex/i);
});

test("STATE.md Blockers/Concerns prose does not set criticality", () => {
  const gsd = { ...baseGsd, concerns: ["Owner gate failed"] };
  const r = deriveStatus({ isGsd: true, gsd, agent: { runtimeState: "idle" } });
  assert.notEqual(r.controlState, "blocked");
});

test("failed verification remains visible while an agent is working", () => {
  const gsd = { ...baseGsd, verification: "failed", phaseLabel: "3 of 4 — Polish" };
  const r = deriveStatus({ isGsd: true, gsd, agent: { runtimeState: "working" } });
  assert.equal(r.controlState, "working");
  assert.equal(r.signals.some((signal) => signal.state === "blocked"), true);
  assert.match(r.signals.find((signal) => signal.state === "blocked")?.reason ?? "", /3 of 4/);
});

test("concerns never block on their own (real-world Blockers/Concerns notes)", () => {
  // unnamed-game case: executing project whose STATE.md holds a deferred,
  // future-tense note under "Blockers/Concerns".
  const gsd = {
    ...baseGsd,
    concerns: ["Native Windows launch validation needs a Windows machine later"],
  };
  const r = deriveStatus({ isGsd: true, gsd, agent: { runtimeState: "unavailable" } });
  assert.notEqual(r.controlState, "blocked");
});

test("raw status text never changes criticality", () => {
  for (const statusLine of ["Blocked", "Complete", "Executing", "Not blocked", "nonsense words"]) {
    const gsd = { ...baseGsd, frontmatterStatus: statusLine, statusLine, nextAction: "Start Phase 3" };
    const result = deriveStatus({ isGsd: true, gsd, agent: { runtimeState: "idle" } });
    assert.equal(result.controlState, "ready", statusLine);
  }
});

test("unknown when recognized but artifacts unreadable", () => {
  const gsd = { ...baseGsd, errors: [".planning/STATE.md is missing — workflow position unknown"] };
  const r = deriveStatus({ isGsd: true, gsd, agent: { runtimeState: "unavailable" } });
  assert.equal(r.controlState, "unknown");
});

test("stale after threshold with no agent activity; not stale while working", () => {
  const oldGsd = { ...baseGsd, lastActivity: minutesAgo(90), evidence: [{ path: ".planning/STATE.md", observedAt: minutesAgo(90) }] };
  const opts = { now: Date.now(), staleThresholdMs: 45 * 60_000 };
  const stale = deriveStatus({ isGsd: true, gsd: oldGsd, agent: { runtimeState: "idle" } }, opts);
  assert.equal(stale.controlState, "stale");
  assert.match(stale.statusReason ?? "", /No updates for/);

  const fresh = deriveStatus(
    { isGsd: true, gsd: { ...baseGsd }, agent: { runtimeState: "idle" } },
    { now: Date.now(), staleThresholdMs: 45 * 60_000 });
  assert.notEqual(fresh.controlState, "stale");
});

test("ready requires an explicit next action and no active agent", () => {
  const gsd = { ...baseGsd, nextAction: "Start Phase 3: Status Queue Polish" };
  const ready = deriveStatus({ isGsd: true, gsd, agent: { runtimeState: "idle" } });
  assert.equal(ready.controlState, "ready");
  assert.match(ready.statusReason ?? "", /Next action:/);

  const working = deriveStatus({ isGsd: true, gsd, agent: { runtimeState: "working" } });
  // An actively-working agent defers "ready"; runtime state wins.
  assert.equal(working.controlState, "working");
});

test("structurally complete projects fall to idle unless blocked/waiting", () => {
  const gsd = { ...baseGsd, progress: { totalPhases: 3, completedPhases: 3, percent: 100 } };
  const r = deriveStatus({ isGsd: true, gsd, agent: { runtimeState: "idle" } });
  assert.equal(r.controlState, "idle");
});

test("non-GSD workstream stays idle-neutral with no fabricated reason", () => {
  const r = deriveStatus({ isGsd: false, agent: { runtimeState: "unavailable" } });
  assert.equal(r.controlState, "idle");
  assert.equal(r.statusReason, undefined);
});

test("independent factual signals are preserved together", () => {
  const gsd = {
    ...baseGsd,
    verification: "failed",
    lastActivity: minutesAgo(90),
    evidence: [{ path: ".planning/STATE.md", observedAt: minutesAgo(90) }],
  };
  const signals = deriveSignals(
    { gsd, agent: { runtimeState: "waiting", providerId: "codex" } },
    { now: Date.now(), staleThresholdMs: 45 * 60_000 },
  );
  assert.deepEqual(signals.map((signal) => signal.state), ["waiting", "blocked", "stale"]);
});

test("isComplete uses structured checklists and counts, never status words or percentages", () => {
  assert.equal(isComplete({ recognized: true, frontmatterStatus: "complete" }), false);
  assert.equal(isComplete({ recognized: true, statusLine: "Complete — done" }), false);
  assert.equal(isComplete({ recognized: true, progress: { percent: 100 } }), false);
  assert.equal(isComplete({ recognized: true, progress: { totalPhases: 3, completedPhases: 3 } }), true);
  assert.equal(isComplete({ recognized: true, roadmapPhases: [
    { number: "1", name: "One", done: true },
    { number: "2", name: "Two", done: true },
  ] }), true);
  assert.equal(isComplete({ recognized: true, roadmapPhases: [
    { number: "1", name: "One", done: true },
    { number: "2", name: "Two", done: false },
  ] }), false);
  assert.equal(isComplete(undefined), false);
});

test("hasOpenWork requires structured evidence", () => {
  assert.equal(hasOpenWork({ recognized: true, statusLine: "Executing" }), false);
  assert.equal(hasOpenWork({ recognized: true, frontmatterStatus: "blocked" }), false);
  assert.equal(hasOpenWork({ recognized: true, roadmapPhases: [{ number: "1", name: "One", done: false }] }), true);
  assert.equal(hasOpenWork({ recognized: true, progress: { totalPhases: 4, completedPhases: 2 } }), true);
  assert.equal(hasOpenWork({ recognized: true, phaseQueue: { plansTotal: 3, plansSummarized: 1 } }), true);
});

test("latestChangeMs takes newest artifact/git evidence", () => {
  const ms = latestChangeMs(
    { lastActivity: minutesAgo(30), evidence: [{ path: "x", observedAt: minutesAgo(10) }] },
    { lastCommitAt: minutesAgo(60) });
  assert.ok(ms <= Date.now() - 9 * 60_000 && ms >= Date.now() - 11 * 60_000);
  assert.equal(latestChangeMs(undefined, undefined), null);
});

test("latestChangeMs ignores undated evidence (read-time stamps, not change times)", () => {
  const ms = latestChangeMs(
    { lastActivity: minutesAgo(90), evidence: [{ path: "ROADMAP.md", observedAt: new Date().toISOString(), dated: false }] },
    undefined);
  assert.ok(ms <= Date.now() - 89 * 60_000);
});

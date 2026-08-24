import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRows, signalRows, signalCounts, statusCounts, filterRows,
} from "../src/core/selectors.js";
import { initialState, applyInventory, applyWorkstreamData, applyAgentHydration } from "../src/core/reducer.js";

function makeStore() {
  let state = initialState();
  const projects = [
    { id: "p-wait", name: "zeta-waiting", path: "/tmp/zeta", isActive: true },
    { id: "p-blocked", name: "alpha-blocked", path: "/tmp/alpha", isActive: false },
    { id: "p-idle", name: "mid-idle-complete", path: "/tmp/mid", isActive: false },
    { id: "p-nongsd", name: "plain-project", path: "/tmp/plain", isActive: false },
    { id: "p-hidden", name: "hidden-project", path: "/tmp/hidden", isActive: false },
  ];
  const trees = new Map([
    ["p-wait", [{ id: null, name: "root", path: "/tmp/zeta" }]],
    ["p-blocked", [{ id: null, name: "root", path: "/tmp/alpha" }]],
    ["p-idle", [{ id: null, name: "root", path: "/tmp/mid" }]],
    ["p-nongsd", [{ id: null, name: "root", path: "/tmp/plain" }]],
    ["p-hidden", [{ id: null, name: "root", path: "/tmp/hidden" }]],
  ]);
  state = applyInventory(state, projects, trees);

  const now = Date.now();
  state = applyWorkstreamData(state, "p-wait::root", {
    at: new Date(now).toISOString(),
    isGsd: true,
    gsd: { recognized: true, verification: "unknown", paused: false, progress: { percent: 40 }, frontmatterStatus: "active", lastActivity: new Date(now - 60_000).toISOString(), evidence: [], errors: [] },
  });
  state = applyAgentHydration(state, [
    { projectID: "p-wait", providerID: "claude", status: "waiting" }, // root worktree (worktreeID absent)
  ]);

  state = applyWorkstreamData(state, "p-blocked::root", {
    at: new Date(now).toISOString(),
    isGsd: true,
    gsd: { recognized: true, verification: "failed", paused: false, progress: { percent: 90 }, frontmatterStatus: "active", lastActivity: new Date(now - 120_000).toISOString(), evidence: [], errors: [] },
  });

  state = applyWorkstreamData(state, "p-idle::root", {
    at: new Date(now).toISOString(),
    isGsd: true,
    gsd: { recognized: true, verification: "passed", paused: false, progress: { totalPhases: 3, completedPhases: 3, percent: 100 }, frontmatterStatus: "complete", lastActivity: new Date(now - 3 * 60_000).toISOString(), evidence: [], errors: [] },
  });

  state = applyWorkstreamData(state, "p-nongsd::root", { at: new Date(now).toISOString(), isGsd: false });
  state = applyWorkstreamData(state, "p-hidden::root", { at: new Date(now).toISOString(), isGsd: true });
  return state;
}

const PREFS = { staleThresholdMinutes: 45, refreshIntervalMinutes: 5, showNonGsd: true, hiddenProjects: ["p-hidden"], filters: { query: "", statuses: [] } };

test("rows sort predictably by project name and expose factual signal rows", () => {
  const rows = buildRows(makeStore(), PREFS);
  assert.deepEqual(rows.map((row) => row.projectName), [
    "alpha-blocked", "mid-idle-complete", "plain-project", "zeta-waiting",
  ]);
  assert.deepEqual(signalRows(rows).map((r) => r.projectName), ["alpha-blocked", "zeta-waiting"]);
});

test("hidden projects are excluded (FR-004)", () => {
  const rows = buildRows(makeStore(), PREFS);
  assert.ok(!rows.some((r) => r.projectId === "p-hidden"));
});

test("counts aggregate by control state", () => {
  const counts = statusCounts(buildRows(makeStore(), PREFS));
  assert.equal(counts.waiting, 1);
  assert.equal(counts.blocked, 1);
  assert.equal(counts.idle, 2);
});

test("signal counts include every factual signal rather than only the row label", () => {
  const rows = buildRows(makeStore(), PREFS);
  const counts = signalCounts(rows);
  assert.equal(counts.waiting, 1);
  assert.equal(counts.blocked, 1);
});

test("filters: query across names/paths/reasons and factual statuses", () => {
  const rows = buildRows(makeStore(), PREFS);
  assert.equal(filterRows(rows, { query: "zeta" }).length, 1);
  assert.equal(filterRows(rows, { query: "verification" }).length, 1);
  assert.deepEqual(filterRows(rows, { statuses: ["blocked"] }).map((r) => r.projectName), ["alpha-blocked"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { refreshDue, sanitizePrefs } from "../src/host/prefs.js";
import { planNavigation } from "../src/core/navigation.js";

test("prefs sanitization clamps thresholds and bounded lists (NFR-004)", () => {
  const cleaned = sanitizePrefs({
    staleThresholdMinutes: 100000,
    refreshIntervalMinutes: 30,
    showNonGsd: "yes",
    hiddenProjects: ["a", 42, "b".repeat(300)],
    filters: { query: "x".repeat(500), statuses: ["waiting", 7], providers: ["ignored"] },
  });
  assert.equal(cleaned.staleThresholdMinutes, 1440);
  assert.equal(cleaned.refreshIntervalMinutes, 30);
  assert.equal(cleaned.showNonGsd, false); // non-boolean falls back to the new default (hidden)
  assert.deepEqual(cleaned.hiddenProjects, ["a"]);
  assert.equal(cleaned.filters.query.length, 200);
  assert.deepEqual(cleaned.filters.statuses, ["waiting"]);
  assert.equal("providers" in cleaned.filters, false);
});

test("prefs sanitization yields defaults for garbage input", () => {
  const cleaned = sanitizePrefs({ staleThresholdMinutes: "soon" });
  assert.deepEqual(cleaned, {
    staleThresholdMinutes: 45,
    refreshIntervalMinutes: 5,
    openOnActiveProject: true,
    showNonGsd: false,
    hiddenProjects: [],
    filters: { query: "", statuses: [] },
  });
});

test("cross-project refresh supports manual or bounded preset intervals", () => {
  const now = Date.parse("2026-08-24T01:00:00Z");
  assert.equal(refreshDue("2026-08-24T00:54:59Z", 5, now), true);
  assert.equal(refreshDue("2026-08-24T00:56:00Z", 5, now), false);
  assert.equal(refreshDue(null, 5, now), true);
  assert.equal(refreshDue("2026-08-23T00:00:00Z", 0, now), false);
  assert.equal(sanitizePrefs({ refreshIntervalMinutes: 7 }).refreshIntervalMinutes, 5);
});

test("navigation plan: inactive project + inactive worktree needs two switches", () => {
  const plan = planNavigation(
    { projectId: "p1", worktreeId: "w2", isActiveWorktree: false },
    { id: "p1", isActive: false },
  );
  assert.deepEqual(plan.steps.map((s) => s.kind), ["switchProject", "switchWorktree"]);
});

test("navigation plan: active project with active workstream is a no-op note", () => {
  const plan = planNavigation(
    { projectId: "p1", worktreeId: null, isActiveWorktree: true },
    { id: "p1", isActive: true },
  );
  assert.deepEqual(plan.steps, []);
  assert.match(plan.note ?? "", /Already the active context/);
});

test("navigation plan: project-only switch explains landing on active worktree (FR-052)", () => {
  const plan = planNavigation(
    { projectId: "p2", worktreeId: null, isActiveWorktree: false },
    { id: "p2", isActive: false },
  );
  assert.deepEqual(plan.steps.map((s) => s.kind), ["switchProject"]);
});

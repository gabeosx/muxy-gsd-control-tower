/**
 * Selectors: factual status signals, predictable sorting, and filtering.
 * Pure functions over TowerState + preferences.
 */
import { deriveStatus } from "./status.js";
import { SIGNAL_STATES } from "./types.js";

/** Default user preferences (persisted via muxy.storage). */
export const DEFAULT_PREFS = {
  staleThresholdMinutes: 45,
  refreshIntervalMinutes: 5,
  // Land inside the active project's own view on panel open (vs all-projects list).
  openOnActiveProject: true,
  // Non-GSD projects stay out of "All workstreams" by default — they still
  // surface in Status signals when an agent reports waiting there.
  showNonGsd: false,
  hiddenProjects: [], // project ids excluded from the dashboard entirely (FR-004)
  filters: { query: "", statuses: [] },
};

/** Derive fresh control states and sort workstreams predictably by name. */
export function buildRows(state, prefs = DEFAULT_PREFS, nowMs = Date.now()) {
  const thresholdMs = Math.max(1, prefs.staleThresholdMinutes ?? 45) * 60_000;
  const rows = [];
  for (const ws of state.workstreams.values()) {
    const hidden = (prefs.hiddenProjects ?? []).includes(ws.projectId);
    if (hidden) continue;
    const derived = deriveStatus(ws, { now: nowMs, staleThresholdMs: thresholdMs });
    rows.push({
      ...ws,
      controlState: derived.controlState,
      statusReason: derived.statusReason,
      signals: derived.signals,
    });
  }
  return rows.sort(compareWorkstreams);
}

/** Rows with one or more explicit status signals. */
export function signalRows(rows) {
  return rows.filter((r) => r.signals?.some((signal) => SIGNAL_STATES.has(signal.state)));
}

export function statusCounts(rows) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const r of rows) counts[r.controlState] = (counts[r.controlState] ?? 0) + 1;
  return counts;
}

export function signalCounts(rows) {
  const counts = {};
  for (const row of rows) {
    for (const state of new Set((row.signals ?? []).map((signal) => signal.state))) {
      counts[state] = (counts[state] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Apply search + facet filters (FR-042).
 * @param {ReturnType<typeof buildRows>} rows
 * @param {{query?:string, statuses?:string[]}} filters
 */
export function filterRows(rows, filters = {}) {
  const query = (filters.query ?? "").trim().toLowerCase();
  const statuses = new Set(filters.statuses ?? []);

  return rows.filter((r) => {
    if (statuses.size && !statuses.has(r.controlState)
      && !r.signals?.some((signal) => statuses.has(signal.state))) return false;
    if (query) {
      const hay = [
        r.projectName,
        r.worktreeName,
        r.worktreePath,
        r.git?.branch,
        r.gsd?.milestone,
        r.gsd?.milestoneName,
        r.gsd?.phaseLabel,
        r.gsd?.phaseName,
        r.gsd?.planLabel,
        r.gsd?.nextAction,
        r.agent?.providerId,
        r.statusReason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

export function compareWorkstreams(a, b) {
  const project = String(a.projectName).localeCompare(String(b.projectName));
  if (project !== 0) return project;
  return String(a.worktreeName ?? a.git?.branch ?? "").localeCompare(
    String(b.worktreeName ?? b.git?.branch ?? ""),
  );
}

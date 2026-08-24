/**
 * Control-state derivation (PRD §3.4). Pure functions.
 *
 * Derived states always carry an explicit, evidence-citing reason; runtime
 * states come only from Muxy agent data (never inferred). Independent factual
 * signals are preserved together so the UI presents all available evidence.
 */

/**
 * @typedef {Object} StatusInput
 * @property {boolean} isGsd
 * @property {import("./types.js").GsdSnapshot} [gsd]
 * @property {import("./types.js").AgentState} agent
 * @property {import("./types.js").GitContext} [git]
 * @property {string} refreshedAt
 * @property {string} [lastEventAt]     ISO time of last relevant workspace event
 */

/**
 * @param {StatusInput} ws
 * @param {{now?: number, staleThresholdMs?: number}} [opts]
 * @returns {{controlState: import("./types.js").ControlState, statusReason?: string, signals: Array<{state:import("./types.js").ControlState, reason:string}>}}
 */
export function deriveStatus(ws, opts = {}) {
  const now = opts.now ?? Date.now();
  const thresholdMs = opts.staleThresholdMs ?? 45 * 60_000;
  const gsd = ws.gsd;
  const runtime = ws.agent?.runtimeState ?? "unavailable";
  const provider = ws.agent?.providerId;

  const signals = deriveSignals(ws, { now, staleThresholdMs: thresholdMs });
  const byState = (state) => signals.find((signal) => signal.state === state);

  // The primary row state is only a compact visual label. Every applicable
  // signal remains in `signals`, so this choice does not hide other evidence.
  if (runtime === "waiting") {
    const signal = byState("waiting");
    return { controlState: "waiting", statusReason: signal?.reason, signals };
  }

  if (runtime === "working") {
    return {
      controlState: "working",
      statusReason: provider ? `${label(provider)} is actively working` : undefined,
      signals,
    };
  }

  for (const state of ["blocked", "unknown", "stale"]) {
    const signal = byState(state);
    if (signal) return { controlState: state, statusReason: signal.reason, signals };
  }

  if (gsd?.recognized && gsd.nextAction && !isComplete(gsd)) {
    return {
      controlState: "ready",
      statusReason: `Next action: ${gsd.nextAction}`,
      signals,
    };
  }

  return { controlState: "idle", statusReason: undefined, signals };
}

/** Derive every factual status signal independently from typed evidence. */
export function deriveSignals(ws, opts = {}) {
  const now = opts.now ?? Date.now();
  const thresholdMs = opts.staleThresholdMs ?? 45 * 60_000;
  const gsd = ws.gsd;
  const runtime = ws.agent?.runtimeState ?? "unavailable";
  const provider = ws.agent?.providerId;
  const signals = [];

  if (runtime === "waiting") {
    signals.push({
      state: "waiting",
      reason: `${provider ? label(provider) : "Agent"} reports it is waiting for you`,
    });
  }

  if (gsd?.recognized && gsd.verification === "failed") {
    signals.push({
      state: "blocked",
      reason: `Phase verification failed${gsd.phaseLabel ? ` (${gsd.phaseLabel})` : ""}`,
    });
  }

  if (gsd?.recognized && gsd.errors.length) {
    signals.push({ state: "unknown", reason: "Planning data unavailable" });
  }

  const open = hasOpenWork(gsd);
  if (open && runtime !== "working") {
    const lastChangeMs = latestChangeMs(gsd, ws.git);
    if (lastChangeMs != null && now - lastChangeMs > thresholdMs) {
      const age = formatAge(now - lastChangeMs);
      signals.push({ state: "stale", reason: `No updates for ${age}; structured work remains open` });
    }
  }
  return signals;
}

/**
 * True when structured checklist or phase-count data proves completion.
 * Raw status text and decorative percentages are display-only.
 */
export function isComplete(gsd) {
  if (!gsd?.recognized) return false;
  const roadmap = gsd.roadmapPhases;
  if (Array.isArray(roadmap) && roadmap.length > 0 && roadmap.every((phase) => phase.done === true)) {
    return true;
  }
  const total = finiteCount(gsd.progress?.totalPhases);
  const completed = finiteCount(gsd.progress?.completedPhases);
  if (total != null && total > 0 && completed != null && completed >= total) return true;
  return false;
}

/** True when structured artifacts prove there is unfinished work. */
export function hasOpenWork(gsd) {
  if (!gsd?.recognized || isComplete(gsd)) return false;
  if (gsd.paused === true || gsd.verification === "pending") return true;
  if (gsd.phaseQueue?.plansTotal > gsd.phaseQueue?.plansSummarized) return true;
  if (Array.isArray(gsd.roadmapPhases) && gsd.roadmapPhases.some((phase) => phase.done === false)) {
    return true;
  }
  const total = finiteCount(gsd.progress?.totalPhases);
  const completed = finiteCount(gsd.progress?.completedPhases);
  if (total != null && total > 0 && completed != null && completed < total) return true;
  return !!gsd.nextAction;
}

function finiteCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Newest trustworthy change timestamp across artifact + git evidence. */
export function latestChangeMs(gsd, git) {
  const candidates = [];
  if (gsd?.lastActivity) candidates.push(Date.parse(gsd.lastActivity));
  for (const ev of gsd?.evidence ?? []) {
    if (ev.dated === false) continue; // "when we read it", not "when it changed"
    const t = Date.parse(ev.observedAt);
    if (Number.isFinite(t)) candidates.push(t);
  }
  if (git?.lastCommitAt) candidates.push(Date.parse(git.lastCommitAt));
  const valid = candidates.filter((t) => Number.isFinite(t));
  return valid.length ? Math.max(...valid) : null;
}

export function formatAge(ms) {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const hours = Math.round(min / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function label(providerId) {
  if (!providerId) return "Agent";
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

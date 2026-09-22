import { deriveStatus } from "./state.mjs";

const CHANGE_STATUSES = Object.freeze(["no-tasks", "complete", "in-progress"]);
const ARTIFACT_STATUSES = Object.freeze(["done", "ready", "blocked", "skipped"]);
const DIAGNOSTIC_SEVERITIES = Object.freeze(["error", "warning"]);
const BIDI_OR_CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clean(value) {
  if (typeof value === "string") return value.replace(BIDI_OR_CONTROL, "�");
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function normalizedAbsolutePath(value) {
  const text = clean(value);
  if (!text || !text.startsWith("/")) return null;
  const parts = [];
  for (const part of text.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length) parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `/${parts.join("/")}` || "/";
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (value === null || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function counts(entries, field, allowed) {
  if (!Array.isArray(entries)) return null;
  const result = Object.fromEntries(allowed.map(status => [status, 0]));
  for (const entry of entries) {
    const value = clean(field === "listed.status" ? entry?.listed?.status : entry?.[field]);
    if (value && Object.hasOwn(result, value)) result[value] += 1;
  }
  return result;
}

function changeId(change) {
  return clean(change?.id) ?? clean(change?.listed?.name);
}

function semanticPart(value) {
  return (clean(value) ?? "unknown").replace(/[^A-Za-z0-9._:-]+/g, "_") || "unknown";
}

function issue(value) {
  if (typeof value === "string") return { code: "ERROR", message: clean(value), source: null };
  if (!object(value)) return null;
  return {
    code: clean(value.code),
    message: clean(value.message),
    source: clean(value.source),
    change: clean(value.change),
  };
}

function diagnosticCompare(left, right) {
  const severity = DIAGNOSTIC_SEVERITIES.indexOf(left.severity) - DIAGNOSTIC_SEVERITIES.indexOf(right.severity);
  if (severity) return severity;
  for (const field of ["code", "source", "change", "message"]) {
    const leftValue = left[field] ?? "";
    const rightValue = right[field] ?? "";
    const leftPoints = Array.from(leftValue, character => character.codePointAt(0));
    const rightPoints = Array.from(rightValue, character => character.codePointAt(0));
    for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
      if (leftPoints[index] < rightPoints[index]) return -1;
      if (leftPoints[index] > rightPoints[index]) return 1;
    }
    if (leftPoints.length !== rightPoints.length) return leftPoints.length < rightPoints.length ? -1 : 1;
  }
  return 0;
}

function diagnosticItems(snapshot) {
  if (!Array.isArray(snapshot?.diagnostics)) return null;
  const sorted = snapshot.diagnostics.map(item => ({
    severity: DIAGNOSTIC_SEVERITIES.includes(item?.severity) ? item.severity : "warning",
    code: clean(item?.code),
    message: clean(item?.message),
    source: clean(item?.source),
    change: clean(item?.change),
  })).sort(diagnosticCompare);
  const occurrences = new Map();
  return sorted.map(item => {
    const key = [item.severity, item.code, item.source, item.change, item.message].join("\u0000");
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    const semanticText = [item.severity, item.code, item.message, item.source, item.change].filter(Boolean).join(" | ");
    return {
      ...item,
      occurrence,
      id: `diagnostic:${semanticPart(item.code)}:${semanticPart(item.source)}:${semanticPart(item.change)}:${semanticPart(item.message)}:${occurrence}`,
      semanticText,
    };
  });
}

function focusTargets(snapshot) {
  if (!Array.isArray(snapshot?.changes)) return [];
  const ids = new Map();
  const targets = [];
  for (const change of snapshot.changes) {
    const name = changeId(change);
    if (!name) continue;
    const occurrence = ids.get(name) ?? 0;
    ids.set(name, occurrence + 1);
    const id = `change:${semanticPart(name)}:${occurrence}`;
    targets.push({ id, kind: "change", label: name });
    if (!Array.isArray(change.artifacts)) continue;
    const artifactIds = new Map();
    for (const artifact of change.artifacts) {
      const artifactName = clean(artifact?.id);
      if (!artifactName) continue;
      const artifactOccurrence = artifactIds.get(artifactName) ?? 0;
      artifactIds.set(artifactName, artifactOccurrence + 1);
      targets.push({ id: `${id}:artifact:${semanticPart(artifactName)}:${artifactOccurrence}`, kind: "artifact", label: artifactName, change: name });
    }
  }
  return targets;
}

function healthValue(health) {
  if (typeof health === "boolean") return health;
  if (!object(health)) return null;
  for (const key of ["healthy", "ok", "ready"]) if (typeof health[key] === "boolean") return health[key];
  return null;
}

function rootsConsistent(snapshot) {
  const root = object(snapshot?.root) ? snapshot.root : null;
  const rootPath = normalizedAbsolutePath(root?.path);
  if (!rootPath) return false;
  const paths = [rootPath];
  const sources = [clean(root?.source)];
  const health = object(snapshot?.health) ? snapshot.health : null;
  if (health && Object.hasOwn(health, "root")) {
    if (!object(health.root) || !clean(health.root.path)) return false;
    paths.push(normalizedAbsolutePath(health.root.path));
    sources.push(clean(health.root.source));
  }
  if (Array.isArray(snapshot?.changes)) {
    for (const change of snapshot.changes) {
      if (Object.hasOwn(change ?? {}, "root")) {
        if (!object(change.root) || !clean(change.root.path)) return false;
        paths.push(normalizedAbsolutePath(change.root.path));
      }
      if (object(change?.planningHome) && Object.hasOwn(change.planningHome, "root")) {
        if (!clean(change.planningHome.root)) return false;
        paths.push(normalizedAbsolutePath(change.planningHome.root));
      }
    }
  }
  const source = sources[0];
  return paths.every(path => path !== null && path === rootPath) && sources.slice(1).filter(Boolean).every(value => value === source);
}

export function overviewSelectionIds(snapshot) {
  return focusTargets(snapshot).map(target => target.id);
}

export function projectOverview(state) {
  const safeState = object(state) ? { ...state, refresh: object(state.refresh) ? state.refresh : {} } : { refresh: {} };
  const snapshot = object(safeState.snapshot) ? safeState.snapshot : null;
  const changes = Array.isArray(snapshot?.changes) ? snapshot.changes : null;
  const artifacts = changes && changes.every(change => Array.isArray(change?.artifacts))
    ? changes.flatMap(change => change.artifacts)
    : null;
  const diagnostics = diagnosticItems(snapshot);
  const runtimeError = issue(safeState.error);
  const refreshError = issue(safeState.refresh.error);
  const defaults = unique((changes ?? []).map(change => clean(change?.planningHome?.defaultSchema)));
  const schemaNames = unique((changes ?? []).map(change => clean(change?.schemaName)));
  const root = object(snapshot?.root) ? snapshot.root : null;
  const health = healthValue(snapshot?.health);
  const healthTrusted = health !== null && rootsConsistent(snapshot);
  const status = deriveStatus(safeState);
  return {
    tab: clean(safeState.tab) ?? "overview",
    status,
    viewport: object(safeState.viewport) ? { width: safeState.viewport.width ?? 0, height: safeState.viewport.height ?? 0 } : { width: 0, height: 0 },
    focusId: clean(safeState.focusId),
    selectedId: clean(safeState.selectedId),
    project: { path: clean(root?.path), source: clean(root?.source) },
    refresh: { status, generation: Number.isInteger(safeState.refresh.generation) ? safeState.refresh.generation : 0, pending: safeState.refresh.pending === true, error: refreshError },
    schemas: { defaults, names: schemaNames },
    changes: { observed: changes !== null, count: changes?.length ?? null, statuses: counts(changes, "listed.status", CHANGE_STATUSES) },
    artifacts: { observed: artifacts !== null, count: artifacts?.length ?? null, statuses: counts(artifacts, "status", ARTIFACT_STATUSES) },
    lifecycle: { complete: changes === null ? null : changes.every(change => change?.complete === true) },
    skills: {
      observed: object(snapshot?.skills),
      managed: Number.isInteger(snapshot?.skills?.managed) && snapshot.skills.managed >= 0 ? snapshot.skills.managed : null,
      enabled: Number.isInteger(snapshot?.skills?.enabled) && snapshot.skills.enabled >= 0 ? snapshot.skills.enabled : null,
    },
    health: { observed: health !== null, value: health, trusted: healthTrusted },
    diagnostics: { observed: diagnostics !== null, count: diagnostics?.length ?? null, errors: diagnostics?.filter(item => item.severity === "error").length ?? null, warnings: diagnostics?.filter(item => item.severity === "warning").length ?? null, items: diagnostics ?? [] },
    errors: { runtime: runtimeError, refresh: refreshError },
    focusTargets: focusTargets(snapshot),
    selectionIds: overviewSelectionIds(snapshot),
  };
}

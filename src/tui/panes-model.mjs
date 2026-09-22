const BIDI_OR_CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function text(value, fallback = "unknown") {
  if (typeof value === "string" && value.length) return value.replace(BIDI_OR_CONTROL, "�");
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}
function pathText(value) { return text(value); }
function idFor(value, occurrence = 0) { return `change:${text(value, "unknown").replace(/[^A-Za-z0-9._:-]+/g, "_")}:${occurrence}`; }
function count(entries) { return Array.isArray(entries) ? entries.length : null; }
function countText(value, noun) { return value === null ? `${noun}: unknown (not observed)` : `${noun}: ${value}`; }
function observed(value, fallback = "unknown (not observed)") { return value === null || value === undefined ? fallback : value; }
function diagnosticText(item) { return [item?.severity?.toUpperCase(), text(item?.code), text(item?.message), text(item?.source)].filter(Boolean).join(" | "); }

export function paneSelectionIds(snapshot) {
  const occurrences = new Map();
  const changes = Array.isArray(snapshot?.changes) ? snapshot.changes.map(change => { const value = change?.id ?? change?.listed?.name; const occurrence = occurrences.get(value) ?? 0; occurrences.set(value, occurrence + 1); return idFor(value, occurrence); }) : [];
  const schemas = Array.isArray(snapshot?.schemas) ? snapshot.schemas.map(schema => `schema:${text(schema?.name, "unknown")}`) : [];
  return [...changes, ...schemas];
}

export function projectChanges(state) {
  const snapshot = object(state?.snapshot) ? state.snapshot : null;
  const changes = Array.isArray(snapshot?.changes) ? snapshot.changes : null;
  const occurrences = new Map();
  const selected = changes?.find(change => { const value = change?.id ?? change?.listed?.name; const occurrence = occurrences.get(value) ?? 0; occurrences.set(value, occurrence + 1); return idFor(value, occurrence) === state.selectedId; }) ?? null;
  const rowOccurrences = new Map();
  const rows = changes?.map(change => {
    const id = change?.id ?? change?.listed?.name;
    const occurrence = rowOccurrences.get(id) ?? 0;
    rowOccurrences.set(id, occurrence + 1);
    return { id: idFor(id, occurrence), label: text(id), status: text(change?.listed?.status), count: `${change?.listed?.completedTasks ?? "?"}/${change?.listed?.totalTasks ?? "?"}` };
  }) ?? [];
  const diagnostics = Array.isArray(snapshot?.diagnostics) ? snapshot.diagnostics : null;
  return {
    tab: state?.tab,
    observed: changes !== null,
    rows,
    selectedId: state?.selectedId ?? null,
    selected: selected ? {
      id: text(selected.id), status: text(selected.listed?.status), complete: typeof selected.complete === "boolean" ? selected.complete : null,
      schema: text(selected.schemaName), root: pathText(selected.root?.path ?? selected.changeRoot), planningRoot: pathText(selected.planningHome?.root),
      artifactsObserved: Array.isArray(selected.artifacts), artifacts: Array.isArray(selected.artifacts) ? selected.artifacts.map(artifact => ({ id: text(artifact.id), status: text(artifact.status), requires: Array.isArray(artifact.requires) ? artifact.requires.map(item => text(item)).join(", ") || "none" : "unknown", declared: text(artifact.outputPath), concrete: Array.isArray(artifact.paths?.existingOutputPaths) ? artifact.paths.existingOutputPaths.map(item => pathText(item)).join(", ") || "none" : "unknown" })) : [],
      handoffEligible: selected.complete === false && selected.listed?.status !== "complete" && typeof selected.schemaName === "string" ? "disabled: choose distinct resolved destination schema" : "unavailable: selected change is incomplete or unresolved",
    } : null,
    lifecycle: selected ? (selected.complete === null ? "unknown (not observed)" : selected.complete ? "complete" : "in progress") : "unknown (not observed)",
    action: { phase: text(state?.action?.phase), confirmation: text(state?.action?.confirmationInput, "") , expected: text(state?.action?.confirmation, ""), preview: object(state?.action?.preview) ? state.action.preview : null },
    root: pathText(snapshot?.root?.path), diagnostics: diagnostics?.map(diagnosticText) ?? null,
  };
}

export function projectArchive(state) {
  return { tab: state?.tab, title: "ARCHIVE", message: "Archived records unavailable: current snapshot exposes active changes only." };
}

export function projectConfig(state) {
  const snapshot = object(state?.snapshot) ? state.snapshot : null;
  const schemas = Array.isArray(snapshot?.schemas) ? snapshot.schemas : null;
  const skills = object(snapshot?.skills) ? snapshot.skills : null;
  return {
    tab: state?.tab, root: pathText(snapshot?.root?.path), observed: snapshot !== null,
    defaultSchema: text(snapshot?.config?.defaultSchema), configValid: typeof snapshot?.config?.valid === "boolean" ? snapshot.config.valid : null,
    schemas: schemas?.map(schema => `${text(schema.name)} (${text(schema.source)}${schema.shadows?.length ? ` shadows=${schema.shadows.length}` : ""})`) ?? null,
    skills: skills ? { managed: observed(skills.managed), enabled: observed(skills.enabled), ownerships: count(skills.ownerships), resources: count(skills.resources), drift: Array.isArray(skills.diagnostics) ? skills.diagnostics.length : null } : null,
    diagnostics: Array.isArray(snapshot?.diagnostics) ? snapshot.diagnostics.map(diagnosticText) : null,
    eligibility: snapshot === null ? "unavailable: snapshot not observed" : "guarded operations require parent preview and exact confirmation",
  };
}

export { text, countText };

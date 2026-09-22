import { BoxRenderable, TextAttributes, TextRenderable } from "@opentui/core";
import { projectArchive, projectChanges, projectConfig } from "./panes-model.mjs";

const COLORS = Object.freeze({ heading: "#f0f0f0", accent: "#7dd3fc", warning: "#facc15", error: "#f87171", muted: "#94a3b8" });

function shorten(value, width) {
  const text = String(value ?? "unknown");
  const marker = " [shortened]";
  if (text.length <= width) return text;
  if (width <= marker.length) return marker.slice(-Math.max(1, width));
  return `${Array.from(text).slice(0, width - marker.length).join("")}${marker}`;
}
function line(key, text, color, attributes = TextAttributes.NONE) { return { key, text, color, attributes }; }
function previewLines(action) {
  const preview = action?.preview;
  if (!preview || typeof preview !== "object") return [];
  const result = preview.result?.data && typeof preview.result.data === "object" ? preview.result.data : preview.result && typeof preview.result === "object" ? preview.result : preview;
  const lines = [
    `Preview: ${preview.operation ?? "unknown operation"}`,
    `Subject: ${preview.selectors?.change ?? preview.selectors?.schema ?? "unknown"}`,
    `Target/effect: ${preview.selectors?.schema ?? preview.selectors?.profile ?? "planned mutation"}`,
    `Mutation: ${result.mutation?.status ?? (result.applied === true ? "applied" : "planned")}`,
  ];
  if (result.compatibility && typeof result.compatibility === "object") lines.push(`Compatibility: ${result.compatibility.compatible === false ? "INCOMPATIBLE" : "compatible"}`);
  if (result.graphDiff && typeof result.graphDiff === "object") lines.push(`Graph diff: +${result.graphDiff.added?.length ?? 0} -${result.graphDiff.removed?.length ?? 0} changed=${result.graphDiff.changed?.length ?? 0}`);
  if (Array.isArray(result.diagnostics)) lines.push(`Diagnostics: ${result.diagnostics.length ? result.diagnostics.slice(0, 2).join(" | ") : "none"}`);
  if (result.compatibility?.compatible === false) lines.push("Incompatible graph. Press A to acknowledge and request a new preview.");
  return lines.slice(0, 8);
}
function layout(viewport, tab) {
  const width = Number.isInteger(viewport?.width) ? viewport.width : 80;
  const height = Number.isInteger(viewport?.height) ? viewport.height : 24;
  if (width < 80 || height < 24) return { width, height, mode: "small" };
  if (tab === "archive") return { width, height, mode: "archive" };
  if (tab === "changes") return { width, height, mode: width >= 140 ? "changes-wide" : width >= 100 ? "changes-medium" : "single" };
  if (tab === "config") return { width, height, mode: width >= 140 ? "config-wide" : width >= 100 ? "config-medium" : "single" };
  return { width, height, mode: "single" };
}

function changesLines(model, viewport) {
  const shape = layout(viewport, "changes");
  if (shape.mode === "small") return [line("resize", "Resize to at least 80x24. Read-only mode. New apply disabled.", COLORS.warning, TextAttributes.BOLD)];
  const rows = model.rows ?? [];
  const selected = model.selected;
  const list = rows.length ? rows.map(row => `${row.id === model.selectedId ? ">" : " "} ${row.label} [${row.status}] ${row.count}`) : [model.observed ? "No active changes observed." : "Changes unavailable: not observed."];
  const actionLines = [...previewLines(model.action), ...(model.action?.phase === "confirming" ? [`CONFIRM ${model.action.expected}`, `Input: ${model.action.confirmation}`, "Enter applies exact phrase. Escape cancels."] : model.action?.phase && model.action.phase !== "selecting" ? [`Action: ${model.action.phase}`] : [])];
  if (shape.mode === "single") return [line("title", "CHANGES", COLORS.heading, TextAttributes.BOLD), line("root", `Root: ${model.root}`), line("list", list.join(" | ")), line("selected", selected ? `Selected: ${selected.id} status=${selected.status} lifecycle=${model.lifecycle}` : "Select active change: none selected"), line("detail", selected ? `Schema: ${selected.schema} Change root: ${selected.root}` : "Details unavailable until explicit selection."), ...actionLines.map((value, index) => line(`action-${index}`, value, COLORS.warning))];
  const left = [`CHANGES  ${model.observed ? `active=${rows.length}` : "active=unknown (not observed)"}`, ...list];
  const right = selected ? ["SELECTED CHANGE", `ID: ${selected.id}`, `Status: ${selected.status}`, `Lifecycle: ${model.lifecycle}`, `Effective schema: ${selected.schema}`, `Root: ${selected.root}`, `Planning root: ${selected.planningRoot}`, `Artifacts: ${selected.artifactsObserved ? selected.artifacts.length : "unknown (not observed)"}`, ...selected.artifacts.map(item => `Artifact ${item.id} [${item.status}] requires=${item.requires} declared=${item.declared} concrete=${item.concrete}`), `Handoff: ${selected.handoffEligible}`] : ["SELECTED CHANGE", "No explicit selection. Details unavailable."];
  if (shape.mode === "changes-wide") return [...left.map((value, index) => line(`left-${index}`, value, index === 0 ? COLORS.heading : COLORS.muted, index === 0 ? TextAttributes.BOLD : TextAttributes.NONE)), ...right.map((value, index) => line(`right-${index}`, value, index === 0 ? COLORS.heading : undefined, index === 0 ? TextAttributes.BOLD : TextAttributes.NONE)), ...actionLines.map((value, index) => line(`action-${index}`, value, COLORS.warning))];
  return [...left.map((value, index) => line(`body-${index}`, value, index === 0 ? COLORS.heading : undefined, index === 0 ? TextAttributes.BOLD : TextAttributes.NONE)), ...right.map((value, index) => line(`detail-${index}`, value)), ...actionLines.map((value, index) => line(`action-${index}`, value, COLORS.warning))];
}

function configLines(model, viewport) {
  const shape = layout(viewport, "config");
  if (shape.mode === "small") return [line("resize", "Resize to at least 80x24. Read-only mode. New apply disabled.", COLORS.warning, TextAttributes.BOLD)];
  const body = ["CONFIG", `Root: ${model.root}`, `Project default: ${model.defaultSchema}`, `Config validity: ${model.configValid === null ? "unknown (not observed)" : model.configValid ? "valid" : "invalid"}`, `Resolved schemas: ${model.schemas?.join(" | ") ?? "unknown (not observed)"}`, `Skills managed=${model.skills?.managed ?? "unknown (not observed)"} enabled=${model.skills?.enabled ?? "unknown (not observed)"} ownerships=${model.skills?.ownerships ?? "unknown"} resources=${model.skills?.resources ?? "unknown"} drift=${model.skills?.drift ?? "unknown"}`, `Operation eligibility: ${model.eligibility}`, ...previewLines(model.action)];
  const diagnostics = model.diagnostics?.length ? model.diagnostics : ["Diagnostics: none observed"];
  if (shape.mode === "single") return [...body, ...diagnostics].map((value, index) => line(`config-single-${index}`, value, index === 0 ? COLORS.heading : undefined, index === 0 ? TextAttributes.BOLD : TextAttributes.NONE));
  return [...body.map((value, index) => line(`config-${index}`, value, index === 0 ? COLORS.heading : undefined, index === 0 ? TextAttributes.BOLD : TextAttributes.NONE)), ...diagnostics.map((value, index) => line(`config-diagnostic-${index}`, value, value.startsWith("ERROR") ? COLORS.error : COLORS.warning))];
}

function archiveLines(state) { const model = projectArchive(state); return [line("title", model.title, COLORS.heading, TextAttributes.BOLD), line("unavailable", model.message, COLORS.warning)]; }

function linesFor(state, viewport) {
  if (state?.tab === "changes") return changesLines(projectChanges(state), viewport);
  if (state?.tab === "config") return configLines(projectConfig(state), viewport);
  if (state?.tab === "archive") return archiveLines(state);
  return [];
}

function regionLines(state, viewport) {
  const shape = layout(viewport, state?.tab);
  if (shape.mode === "small" || shape.mode === "single" || shape.mode === "archive") return [{ id: "main", width: "100%", lines: linesFor(state, viewport) }];
  if (state.tab === "changes") {
    const model = projectChanges(state);
    const rows = model.rows?.length ? model.rows.map(row => `${row.id === model.selectedId ? ">" : " "} ${row.label} [${row.status}] ${row.count}`) : [model.observed ? "No active changes observed." : "Changes unavailable: not observed."];
    const selected = model.selected;
    const details = selected ? ["SELECTED CHANGE", `ID: ${selected.id}`, `Status: ${selected.status}`, `Lifecycle: ${model.lifecycle}`, `Effective schema: ${selected.schema}`, `Root: ${selected.root}`, `Planning root: ${selected.planningRoot}`, `Artifacts: ${selected.artifactsObserved ? selected.artifacts.length : "unknown (not observed)"}`, ...selected.artifacts.map(item => `Artifact ${item.id} [${item.status}] requires=${item.requires} declared=${item.declared} concrete=${item.concrete}`), ...previewLines(model.action)] : ["SELECTED CHANGE", "No explicit selection. Details unavailable.", ...previewLines(model.action)];
    const footer = [`Handoff: ${selected?.handoffEligible ?? "unavailable: select active change"}`, "Keys: Up/Down select, Tab destination, Enter preview", "Archive: unavailable from active snapshot"];
    const toLines = (values, prefix, heading = false) => values.map((value, index) => line(`${prefix}-${index}`, value, heading && index === 0 ? COLORS.heading : undefined, heading && index === 0 ? TextAttributes.BOLD : TextAttributes.NONE));
    if (shape.mode === "changes-medium") return [{ id: "list", width: 30, lines: toLines([`CHANGES ${model.observed ? `active=${model.rows.length}` : "active=unknown"}`, ...rows], "list", true) }, { id: "gap", width: 1, lines: [line("gap", "|")] }, { id: "detail", width: 68, lines: toLines(details, "detail", true) }];
    return [{ id: "list", width: 32, lines: toLines([`CHANGES ${model.observed ? `active=${model.rows.length}` : "active=unknown"}`, ...rows], "list", true) }, { id: "gap-a", width: 1, lines: [line("gap-a", "|")] }, { id: "detail", width: 66, lines: toLines(details, "detail", true) }, { id: "gap-b", width: 1, lines: [line("gap-b", "|")] }, { id: "footer", width: 39, lines: toLines(footer, "footer") }];
  }
  const model = projectConfig(state);
  const body = ["CONFIG", `Root: ${model.root}`, `Project default: ${model.defaultSchema}`, `Config validity: ${model.configValid === null ? "unknown (not observed)" : model.configValid ? "valid" : "invalid"}`, `Resolved schemas: ${model.schemas?.join(" | ") ?? "unknown (not observed)"}`];
  const footer = [`Skills managed=${model.skills?.managed ?? "unknown"} enabled=${model.skills?.enabled ?? "unknown"}`, `Ownerships=${model.skills?.ownerships ?? "unknown"} resources=${model.skills?.resources ?? "unknown"} drift=${model.skills?.drift ?? "unknown"}`, `Eligibility: ${model.eligibility}`, "Keys: Up/Down select schema, Enter preview"];
  const diagnostics = model.diagnostics?.length ? model.diagnostics : ["Diagnostics: none observed"];
  const toLines = (values, prefix, heading = false) => values.map((value, index) => line(`${prefix}-${index}`, value, heading && index === 0 ? COLORS.heading : value.startsWith("ERROR") ? COLORS.error : undefined, heading && index === 0 ? TextAttributes.BOLD : TextAttributes.NONE));
  if (shape.mode === "config-medium") return [{ id: "config", width: 24, lines: toLines(body, "config", true) }, { id: "gap", width: 1, lines: [line("config-gap", "|")] }, { id: "detail", width: 74, lines: toLines([...footer, ...diagnostics], "config-detail") }];
  return [{ id: "config", width: 26, lines: toLines(body, "config", true) }, { id: "gap-a", width: 1, lines: [line("config-gap-a", "|")] }, { id: "detail", width: 72, lines: toLines([...footer, ...diagnostics], "config-detail") }, { id: "gap-b", width: 1, lines: [line("config-gap-b", "|")] }, { id: "footer", width: 39, lines: toLines(["CONFIG STATUS", ...diagnostics, "No mutation without preview and exact confirmation."], "config-footer") }];
}

export function createPanes(renderer, options = {}) {
  const noColor = options.noColor === true || (typeof process !== "undefined" && process.env?.NO_COLOR?.length > 0);
  const root = new BoxRenderable(renderer, { id: "panes-root", width: "100%", height: "100%", flexDirection: "row", overflow: "hidden" });
  renderer.root.add(root);
  const regions = new Map();
  const nodes = new Map();
  let disposed = false;
  function update(state, viewport) {
    if (disposed) return;
    const visible = ["changes", "archive", "config"].includes(state?.tab);
    root.visible = visible;
    if (!visible) return;
    const wantedRegions = regionLines(state, viewport ?? state?.viewport);
    const wantedRegionIds = new Set(wantedRegions.map(region => region.id));
    for (const [id, region] of regions) {
      if (wantedRegionIds.has(id)) continue;
      for (const key of nodes.keys()) if (key.startsWith(`${id}:`)) nodes.delete(key);
      if (region.parent === root) root.remove(region);
      region.destroyRecursively();
      regions.delete(id);
    }
    for (const spec of wantedRegions) {
      let region = regions.get(spec.id);
      if (!region) {
        region = new BoxRenderable(renderer, { id: `pane-region-${spec.id}`, width: spec.width, height: "100%", flexDirection: "column", overflow: "hidden" });
        regions.set(spec.id, region);
        root.add(region);
      } else region.width = spec.width;
    }
    const wanted = wantedRegions.flatMap(spec => spec.lines.map(item => ({ ...item, region: spec.id, regionWidth: spec.width })));
    const width = viewport?.width ?? state?.viewport?.width ?? 80;
    const wantedKeys = new Set(wanted.map((item, index) => `${item.region}:${item.key}:${index}`));
    for (const [key, node] of nodes) {
      if (wantedKeys.has(key)) continue;
      if (node.parent) node.parent.remove(node);
      node.destroy();
      nodes.delete(key);
    }
    for (const [index, item] of wanted.entries()) {
      const key = `${item.region}:${item.key}:${index}`;
      let node = nodes.get(key);
      const regionWidth = typeof item.regionWidth === "number" ? item.regionWidth : width;
      const content = shorten(item.text, Math.max(1, regionWidth - 1));
      if (!node) {
        const renderOptions = { id: `pane-${key}`, content, width: "100%", height: 1, wrapMode: "none", truncate: true, attributes: item.attributes };
        if (!noColor && item.color) renderOptions.fg = item.color;
        node = new TextRenderable(renderer, renderOptions);
        nodes.set(key, node);
        regions.get(item.region).add(node);
      } else {
        node.content = content;
        node.attributes = item.attributes;
        if (!noColor) node.fg = item.color;
      }
    }
  }
  return { root, update, dispose() { if (disposed) return; disposed = true; if (root.parent) root.parent.remove(root); root.destroyRecursively(); nodes.clear(); } };
}

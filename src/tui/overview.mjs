import { BoxRenderable, TextAttributes, TextRenderable } from "@opentui/core";

const COLORS = Object.freeze({ heading: "#f0f0f0", accent: "#7dd3fc", warning: "#facc15", error: "#f87171" });

function value(value, fallback = "unknown") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function shorten(text, limit) {
  if (text.length <= limit) return text;
  const marker = " [shortened]";
  const characters = Array.from(text);
  if (limit <= marker.length) return marker.slice(-limit);
  return `${characters.slice(0, limit - marker.length).join("")}${marker}`;
}

function boundedLine(text, width) {
  return shorten(String(text), Math.max(1, width - 1));
}

function countText(count, noun) {
  return count === null ? `${noun}: unknown (not observed)` : `${noun}: ${count}`;
}

function statusText(statuses) {
  if (!statuses) return "unknown (not observed)";
  return Object.entries(statuses).map(([name, count]) => `${name}=${count}`).join(" ");
}

function observedNames(names, observed) {
  if (!observed) return "unknown (not observed)";
  return names?.length ? names.join(", ") : "none (observed)";
}

function issueText(item) {
  if (!item) return null;
  return [item.code, item.message, item.source].filter(Boolean).join(": ") || "unknown error";
}

function diagnosticLine(item, width) {
  const severity = item.severity.toUpperCase();
  const code = value(item.code);
  const change = item.change ? `[${item.change}]` : "";
  if (width >= 140) return `${severity} ${code} | ${value(change)} | ${value(item.message)} | ${value(item.source)}`;
  return `${severity} ${code} ${change} ${value(item.message)}`.replace(/  +/g, " ");
}

function linesFor(model, viewport) {
  const width = Number.isInteger(viewport?.width) && viewport.width > 0 ? viewport.width : 80;
  const height = Number.isInteger(viewport?.height) && viewport.height > 0 ? viewport.height : 24;
  const small = width < 80 || height < 24;
  const errorLimit = Math.max(1, width - 1);
  const lines = [{ key: "title", text: "OPEN SPEC OVERVIEW", attributes: TextAttributes.BOLD, color: COLORS.heading }];
  lines.push({ key: "status", text: `Status: ${value(model.status).toUpperCase()}`, color: model.status === "error" ? COLORS.error : COLORS.accent });
  if (small) {
    lines.push({ key: "refresh", text: `Refresh: ${value(model.refresh?.status).toUpperCase()}${model.refresh?.pending ? " (pending)" : ""}` });
    const error = issueText(model.errors?.runtime) ?? issueText(model.errors?.refresh);
    lines.push({ key: "error", text: error ? boundedLine(`Error: ${shorten(error, errorLimit)}`, width) : "Error: none" });
    return lines.slice(0, Math.max(1, height));
  }
  if (width < 100) {
    lines.push({ key: "focus", text: `Focus: ${value(model.focusId, "none")} [focus]` });
    lines.push({ key: "selection", text: `Selection: ${value(model.selectedId, "none")} [selected]` });
  } else {
    lines.push({ key: "selection", text: `Focus: ${value(model.focusId, "none")} [focus] | Selection: ${value(model.selectedId, "none")} [selected]` });
  }
  lines.push({ key: "project", text: "Project", attributes: TextAttributes.BOLD, color: COLORS.heading });
  lines.push({ key: "project-path", text: `  Path: ${value(model.project?.path)}` });
  lines.push({ key: "project-source", text: `  Source: ${value(model.project?.source)}` });
  lines.push({ key: "refresh", text: `Refresh: ${value(model.refresh?.status).toUpperCase()} generation=${value(model.refresh?.generation, "0")}` });
  lines.push({ key: "root", text: `Root: ${value(model.project?.path)} (${value(model.project?.source)})` });
  lines.push({ key: "schema", text: `Schema: defaults=${observedNames(model.schemas?.defaults, model.changes?.observed)} effective=${observedNames(model.schemas?.names, model.changes?.observed)}` });
  lines.push({ key: "lifecycle", text: `Lifecycle: ${model.lifecycle?.complete === null ? "unknown (not observed)" : model.lifecycle.complete ? "complete" : "in progress"}` });
  lines.push({ key: "changes", text: `${countText(model.changes?.count, "Observed changes")} | statuses: ${statusText(model.changes?.statuses)}` });
  lines.push({ key: "artifacts", text: `${countText(model.artifacts?.count, "Observed artifacts")} | statuses: ${statusText(model.artifacts?.statuses)}` });
  lines.push({ key: "skills", text: `Skills: managed=${value(model.skills?.managed)} enabled=${value(model.skills?.enabled)}` });
  lines.push({ key: "health", text: `Health: ${model.health?.trusted ? (model.health.value ? "healthy (trusted)" : "unhealthy (trusted)") : "unknown (untrusted)"}` });
  const diagnostics = model.diagnostics?.items ?? [];
  lines.push({ key: "diagnostics", text: model.diagnostics?.observed ? `Diagnostics: ${model.diagnostics.errors} errors, ${model.diagnostics.warnings} warnings` : "Diagnostics: unknown (not observed)", attributes: TextAttributes.BOLD, color: model.diagnostics?.errors ? COLORS.error : COLORS.heading });
  if (width >= 100) {
    const available = Math.max(0, height - lines.length - 2);
    const shown = diagnostics.slice(0, available);
    for (const item of shown) lines.push({ key: item.id, text: diagnosticLine(item, width), color: item.severity === "error" ? COLORS.error : COLORS.warning });
    if (diagnostics.length > shown.length) lines.push({ key: "diagnostics-more", text: `${diagnostics.length - shown.length} more diagnostics not shown` });
  }
  const runtimeError = issueText(model.errors?.runtime);
  const refreshError = issueText(model.errors?.refresh);
  lines.push({ key: "errors", text: runtimeError || refreshError ? boundedLine(`Errors: ${shorten(runtimeError ?? refreshError, errorLimit)}`, width) : "Errors: none", color: runtimeError || refreshError ? COLORS.error : undefined });
  return lines;
}

export function createOverview(renderer, options = {}) {
  const noColor = options.noColor === true || (typeof process !== "undefined" && process.env?.NO_COLOR?.length > 0);
  const root = new BoxRenderable(renderer, { id: "overview-root", width: "100%", height: "100%", flexDirection: "column", overflow: "hidden" });
  renderer.root.add(root);
  const nodes = new Map();
  let disposed = false;

  function update(model, viewport) {
    if (disposed) return;
    const visible = model?.tab === "overview";
    root.visible = visible;
    if (!visible) return;
    const wanted = linesFor(model ?? {}, viewport ?? model?.viewport);
    const displayWidth = viewport?.width ?? model?.viewport?.width ?? 80;
    const wantedKeys = new Set(wanted.map((line, index) => `${line.key}:${index}`));
    for (const [key, node] of nodes) {
      if (wantedKeys.has(key)) continue;
      if (node.parent === root) root.remove(node);
      node.destroy();
      nodes.delete(key);
    }
    for (const [index, line] of wanted.entries()) {
      const key = `${line.key}:${index}`;
      let node = nodes.get(key);
      if (!node) {
        const renderOptions = { id: `overview-${key}`, content: boundedLine(line.text, displayWidth), width: "100%", height: 1, wrapMode: "none", truncate: true, attributes: line.attributes ?? TextAttributes.NONE };
        if (!noColor && line.color) renderOptions.fg = line.color;
        node = new TextRenderable(renderer, renderOptions);
        nodes.set(key, node);
        root.add(node);
      } else {
        node.content = boundedLine(line.text, displayWidth);
        node.attributes = line.attributes ?? TextAttributes.NONE;
        if (!noColor) node.fg = line.color;
      }
    }
  }

  return {
    root,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (root.parent) root.parent.remove(root);
      root.destroyRecursively();
      nodes.clear();
    },
  };
}

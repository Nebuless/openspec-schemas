const TABS = Object.freeze(["overview", "changes", "archive", "config"]);
const TAB_SET = new Set(TABS);

function snapshotOrNull(snapshot) {
  return snapshot && typeof snapshot === "object" ? snapshot : null;
}

function errorOrNull(error) {
  return error == null ? null : typeof error === "string" ? { code: "ERROR", message: error } : { ...error };
}

function requestId(generation) {
  return `refresh-${generation}`;
}

function selectionIds(action) {
  if (Array.isArray(action.selectionIds)) return action.selectionIds;
  if (Array.isArray(action.validSelectionIds)) return action.validSelectionIds;
  if (Array.isArray(action.context?.selectionIds)) return action.context.selectionIds;
  return null;
}

function actionValue(action, primary, fallback) {
  return action[primary] !== undefined ? action[primary] : action[fallback];
}

function viewportReady(viewport) { return Number.isInteger(viewport?.width) && Number.isInteger(viewport?.height) && viewport.width >= 80 && viewport.height >= 24; }
function actionNeedsCancel(state) { return ["previewing", "preview-ready", "confirming"].includes(state.action?.phase); }
function resetAction(action) { return { ...action, phase: "selecting", preview: null, confirmation: "", confirmationInput: "", error: null, requestId: null }; }

export function createInitialState(snapshot = null) {
  return {
    tab: "overview",
    focusId: null,
    selectedId: null,
    snapshot: snapshotOrNull(snapshot),
    refresh: { generation: 0, pending: false, requestId: null, error: null },
    error: null,
    exitCode: null,
    viewport: { width: 0, height: 0 },
    frameReady: false,
    action: { phase: "selecting", operation: null, selectors: null, preview: null, confirmation: "", confirmationInput: "", error: null, requestId: null },
  };
}

export function deriveStatus(state) {
  if (state.error || (state.refresh.error && !state.snapshot)) return "error";
  if (!state.snapshot) return state.refresh.pending ? "loading" : "unloaded";
  if (state.refresh.pending) return "refreshing";
  if (state.refresh.error) return "stale";
  return "ready";
}

export function getStatus(state) {
  return {
    value: deriveStatus(state),
    tab: state.tab,
    pending: state.refresh.pending,
    error: state.error ?? state.refresh.error,
    frameReady: state.frameReady,
  };
}

function noOp(state) {
  return { state, effects: [] };
}

export function reduce(state, action) {
  if (!action || typeof action.type !== "string" || state.exitCode !== null) return noOp(state);
  if (state.action?.phase === "applying" && ["tab/select", "focus/select", "selection/select"].includes(action.type)) return noOp(state);

  switch (action.type) {
    case "tab/select":
      return TAB_SET.has(action.tab) && action.tab !== state.tab
        ? { state: { ...state, tab: action.tab, focusId: null, selectedId: null, action: resetAction(state.action) }, effects: actionNeedsCancel(state) ? [{ type: "action/cancel" }] : [] }
        : noOp(state);
    case "focus/select": {
      const focusId = actionValue(action, "focusId", "id") ?? null;
      return focusId !== state.focusId
        ? { state: { ...state, focusId }, effects: [] }
        : noOp(state);
    }
    case "selection/select": {
      const selectedId = actionValue(action, "selectedId", "id") ?? null;
      return selectedId !== state.selectedId
        ? { state: { ...state, selectedId, action: resetAction(state.action) }, effects: actionNeedsCancel(state) ? [{ type: "action/cancel" }] : [] }
        : noOp(state);
    }
    case "refresh/request": {
      if (!state.snapshot || state.refresh.pending) return noOp(state);
      const generation = state.refresh.generation + 1;
      const id = requestId(generation);
      return {
        state: {
          ...state,
          refresh: { generation, pending: true, requestId: id, error: null },
        },
        effects: [{ type: "refresh/request", requestId: id }],
      };
    }
    case "snapshot/receive": {
      const ids = selectionIds(action);
      const selectedId = ids && ids.includes(state.selectedId) ? state.selectedId : null;
      return { state: { ...state, snapshot: snapshotOrNull(action.snapshot), selectedId }, effects: [] };
    }
    case "refresh/success": {
      if (!state.refresh.pending || action.requestId !== state.refresh.requestId) return noOp(state);
      const ids = selectionIds(action);
      const selectedId = ids && ids.includes(state.selectedId) ? state.selectedId : null;
      return {
        state: {
          ...state,
          snapshot: snapshotOrNull(action.snapshot),
          selectedId,
          refresh: { ...state.refresh, pending: false, requestId: null, error: null },
          action: { ...state.action, phase: "selecting", preview: null, confirmation: "", confirmationInput: "", error: null },
        },
        effects: [],
      };
    }
    case "action/preview":
      return viewportReady(state.viewport) && action.operation && action.selectors ? { state: { ...state, action: { ...state.action, phase: "previewing", operation: action.operation, selectors: action.selectors, preview: null, confirmation: "", error: null, requestId: action.requestId } }, effects: [{ type: "action/preview", requestId: action.requestId, operation: action.operation, selectors: action.selectors }] } : noOp(state);
    case "action/preview-ready":
      if (state.action.requestId !== action.requestId) return noOp(state);
      return { state: { ...state, action: { ...state.action, phase: "preview-ready", preview: action.preview, confirmation: action.confirmation, error: null } }, effects: [] };
    case "action/confirm-open":
      return viewportReady(state.viewport) && state.action.phase === "preview-ready" ? { state: { ...state, action: { ...state.action, phase: "confirming", confirmationInput: "" } }, effects: [] } : noOp(state);
    case "action/confirmation-input":
      return state.action.phase === "confirming" ? { state: { ...state, action: { ...state.action, confirmationInput: action.value } }, effects: [] } : noOp(state);
    case "action/apply":
      return viewportReady(state.viewport) && state.action.phase === "confirming" && action.requestId === state.action.requestId && action.token && action.confirmation
         ? { state: { ...state, action: { ...state.action, phase: "applying", confirmation: action.confirmation } }, effects: [{ type: "action/apply", requestId: action.requestId, operation: state.action.operation, selectors: state.action.selectors, token: action.token, confirmation: action.confirmation }] }
        : noOp(state);
    case "action/result":
      if (state.action.requestId !== action.requestId) return noOp(state);
      return { state: { ...state, action: { ...state.action, phase: "result", preview: action.result, error: null } }, effects: [] };
    case "action/failure":
      if (state.action.requestId !== action.requestId) return noOp(state);
      return { state: { ...state, action: { ...state.action, phase: "failed", error: errorOrNull(action.error) } }, effects: [] };
    case "action/cancel":
      return state.action.phase === "confirming" || state.action.phase === "preview-ready" || state.action.phase === "previewing"
        ? { state: { ...state, action: { ...state.action, phase: "cancelling", confirmation: "" } }, effects: [{ type: "action/cancel", requestId: state.action.requestId }] }
        : noOp(state);
    case "action/cancelled":
      return { state: { ...state, action: { ...state.action, phase: "selecting", preview: null, confirmation: "", confirmationInput: "", error: null, requestId: null } }, effects: [] };
    case "refresh/failure": {
      if (!state.refresh.pending || action.requestId !== state.refresh.requestId) return noOp(state);
      const error = errorOrNull(action.error ?? { code: "REFRESH_FAILED", message: "Refresh failed" });
      return {
        state: {
          ...state,
          refresh: { ...state.refresh, pending: false, requestId: null, error },
        },
        effects: [],
      };
    }
    case "error/dismiss":
      return state.error === null && state.refresh.error === null
        ? noOp(state)
        : { state: { ...state, error: null, refresh: { ...state.refresh, error: null } }, effects: [] };
    case "viewport/set":
      if (!Number.isInteger(action.width) || !Number.isInteger(action.height)) return noOp(state);
      if (action.width === state.viewport.width && action.height === state.viewport.height) return noOp(state);
      return {
        state: { ...state, viewport: { width: action.width, height: action.height }, frameReady: false },
        effects: [],
      };
    case "frame/ready":
      return state.frameReady ? noOp(state) : { state: { ...state, frameReady: true }, effects: [] };
    case "error/set": {
      const error = errorOrNull(action.error);
      return error ? { state: { ...state, error }, effects: [] } : noOp(state);
    }
    case "quit": {
      const code = Number.isInteger(action.exitCode) ? action.exitCode : Number.isInteger(action.code) ? action.code : 0;
      return { state: { ...state, exitCode: code }, effects: [{ type: "quit", exitCode: code }] };
    }
    default:
      return noOp(state);
  }
}

export { TABS };

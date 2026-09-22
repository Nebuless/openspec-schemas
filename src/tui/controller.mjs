import { createInitialState, reduce } from "./state.mjs";
import { routeKey, validConfirmationInput, confirmationCharacter } from "./input.mjs";

function refreshFailure(requestId, error) {
  return { type: "refresh/failure", requestId, error };
}

export function attachController(renderer, options = {}) {
  let state = options.initialState ?? createInitialState(options.snapshot ?? null);
  let disposed = false;
  let quitStarted = false;
  let frameGeneration = 0;
  const refresh = options.refresh;
  const onState = options.onState;
  const onQuit = options.onQuit;
  const modal = options.modal;
  const textInput = options.textInput;
  const focusedTarget = options.focusedTarget;
  const semantic = options.semantic ?? {};
  let actionToken = null;
  let activeActionRequestId = null;
  const viewportReady = value => Number.isInteger(value?.width) && Number.isInteger(value?.height) && value.width >= 80 && value.height >= 24;

  const notify = previous => {
    if (!disposed && state !== previous) onState?.(state, previous);
  };
  const dispatch = action => {
    if (disposed) return state;
    const previous = state;
    const result = reduce(state, action);
    state = result.state;
    notify(previous);
    for (const effect of result.effects) runEffect(effect);
    return state;
  };
  const waitForFrame = generation => {
    if (typeof renderer.idle !== "function") return;
    Promise.resolve(renderer.idle()).then(() => {
      if (!disposed && generation === frameGeneration) dispatch({ type: "frame/ready" });
    });
  };
  const runEffect = effect => {
    if (effect.type === "quit") {
      if (!quitStarted) {
        quitStarted = true;
        onQuit?.(effect.exitCode);
      }
      return;
    }
    if (effect.type === "action/preview") {
      if (!viewportReady(state.viewport)) return;
      activeActionRequestId = effect.requestId;
      Promise.resolve(options.preview?.(effect)).then(result => {
        if (activeActionRequestId !== effect.requestId || state.action.requestId !== effect.requestId || state.action.phase !== "previewing") {
          if (result?.token) options.cancel?.(result.token, effect.requestId);
          return;
        }
        actionToken = result?.token ?? null;
        dispatch({ type: "action/preview-ready", requestId: effect.requestId, preview: result?.preview ?? result, confirmation: result?.confirmation ?? "" });
      }, error => {
        if (activeActionRequestId !== effect.requestId || state.action.requestId !== effect.requestId) return;
        actionToken = null;
        activeActionRequestId = null;
        dispatch({ type: "action/failure", requestId: effect.requestId, error });
      });
      return;
    }
    if (effect.type === "action/apply") {
      if (!viewportReady(state.viewport)) return;
      Promise.resolve(options.apply?.({ ...effect, token: actionToken })).then(result => {
        if (activeActionRequestId !== effect.requestId || state.action.requestId !== effect.requestId) return;
        actionToken = null;
        activeActionRequestId = null;
        dispatch({ type: "action/result", requestId: effect.requestId, result });
        dispatch({ type: "refresh/request" });
      }, error => {
        if (activeActionRequestId !== effect.requestId || state.action.requestId !== effect.requestId) return;
        actionToken = null;
        activeActionRequestId = null;
        dispatch({ type: "action/failure", requestId: effect.requestId, error });
      });
      return;
    }
    if (effect.type === "action/cancel") {
      options.cancel?.(actionToken, effect.requestId ?? activeActionRequestId);
      actionToken = null;
      activeActionRequestId = null;
      dispatch({ type: "action/cancelled" });
      return;
    }
    if (effect.type !== "refresh/request") return;
    const settle = result => {
      if (result && typeof result === "object" && Object.hasOwn(result, "snapshot")) {
        dispatch({
          type: "refresh/success",
          requestId: effect.requestId,
          snapshot: result.snapshot,
          selectionIds: result.selectionIds ?? result.context?.selectionIds,
        });
      } else {
        dispatch({ type: "refresh/success", requestId: effect.requestId, snapshot: result, selectionIds: options.selectionIds?.(result) });
      }
    };
    if (typeof refresh !== "function") {
      dispatch(refreshFailure(effect.requestId, { code: "REFRESH_UNAVAILABLE", message: "Refresh unavailable" }));
      return;
    }
    Promise.resolve().then(() => refresh(effect.requestId, state)).then(settle, error => {
      dispatch(refreshFailure(effect.requestId, error instanceof Error ? { code: "REFRESH_FAILED", message: error.message } : error));
    });
  };
  const keyHandler = event => {
    const actionModal = state.action?.phase === "confirming";
    const actionModalHandler = actionModal ? (keyEvent => {
      const rawName = typeof keyEvent?.name === "string" ? keyEvent.name : "";
      const name = rawName.toLowerCase();
      if (name === "escape") { dispatch({ type: "action/cancel" }); return true; }
      if (name === "enter") {
        const expected = state.action.confirmation;
        if (state.action.confirmationInput === expected) dispatch({ type: "action/apply", requestId: state.action.requestId, token: actionToken, confirmation: state.action.confirmationInput });
        return true;
      }
      const character = confirmationCharacter(keyEvent);
      if (character !== null) {
        const current = state.action.confirmationInput ?? "";
        const next = `${current}${character}`;
        if (validConfirmationInput(next)) dispatch({ type: "action/confirmation-input", value: next });
        return true;
      }
      if (name === "backspace") { dispatch({ type: "action/confirmation-input", value: (state.action.confirmationInput ?? "").slice(0, -1) }); return true; }
      return true;
    }) : null;
    const routed = routeKey(event, {
      state,
      modal: actionModal || (modal?.active ?? modal),
      textInput: textInput?.active ?? textInput,
      focusedTarget: focusedTarget?.active ?? focusedTarget,
      modalHandler: actionModalHandler ?? modal?.handleKey,
      textInputHandler: textInput?.handleKey,
      focusedTargetHandler: focusedTarget?.handleKey,
      semantic,
      actionHandler: event => {
        const name = typeof event?.name === "string" ? event.name.toLowerCase() : "";
        const previewData = state.action.preview?.result?.data ?? state.action.preview?.result;
        if (name === "a" && state.action.phase === "preview-ready" && previewData?.compatibility?.compatible === false && state.action.selectors?.acknowledgement !== true) {
          const requestId = `request-preview-${Date.now().toString(36)}`;
          dispatch({ type: "action/preview", requestId, operation: state.action.operation, selectors: { ...state.action.selectors, acknowledgement: true } });
          return true;
        }
        if (name === "enter" && state.selectedId && state.action.phase === "selecting" && viewportReady(state.viewport)) {
          const requestId = `request-preview-${Date.now().toString(36)}`;
          const operation = semantic.operation?.(state) ?? null;
          const selectors = semantic.selectors?.(state) ?? null;
          if (operation && selectors) { dispatch({ type: "action/preview", requestId, operation, selectors }); return true; }
        }
        if (name === "enter" && state.action.phase === "preview-ready" && viewportReady(state.viewport)) { dispatch({ type: "action/confirm-open" }); return true; }
        return false;
      },
      error: state.error ?? state.refresh.error,
      busy: state.refresh.pending,
    });
    if (!routed.claimed) return;
    event.preventDefault?.();
    event.stopPropagation?.();
      if (routed.action) dispatch(routed.action);
  };
  const resizeHandler = (width, height) => {
    const previous = state;
    dispatch({ type: "viewport/set", width, height });
    if (!viewportReady({ width, height }) && ["previewing", "preview-ready", "confirming"].includes(state.action?.phase)) dispatch({ type: "action/cancel" });
    if (state !== previous) {
      frameGeneration += 1;
      waitForFrame(frameGeneration);
    }
  };
  const initialWidth = renderer.width;
  const initialHeight = renderer.height;
  if (Number.isInteger(initialWidth) && Number.isInteger(initialHeight)) {
    dispatch({ type: "viewport/set", width: initialWidth, height: initialHeight });
  }
  renderer.keyInput?.on("keypress", keyHandler);
  renderer.on?.("resize", resizeHandler);
  waitForFrame(frameGeneration);

  return {
    getState: () => state,
    dispatch,
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.keyInput?.off("keypress", keyHandler);
      renderer.off?.("resize", resizeHandler);
    },
  };
}

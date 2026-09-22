const DIGIT_TABS = Object.freeze({ "1": "overview", "2": "changes", "3": "archive", "4": "config" });

function callback(context, name) {
  const handler = context?.[name];
  return typeof handler === "function" ? handler : null;
}

function resolveSemantic(value, event, context) {
  if (typeof value === "function") return value(event, context);
  return value ?? null;
}

export function normalizeKeyEvent(event) {
  if (!event || (event.eventType && !["press", "repeat"].includes(event.eventType))) return null;
  const rawName = typeof event.name === "string" ? event.name : "";
  const name = rawName.toLowerCase() === "return" ? "enter" : rawName;
  const ctrl = event.ctrl === true;
  const shift = event.shift === true;
  const meta = event.meta === true || event.option === true || event.alt === true;
  if (!name || meta || event.super === true || event.hyper === true || event.capsLock === true || event.numLock === true || (ctrl && name.toLowerCase() !== "c")) return null;
  if (ctrl && shift) return null;
  if (!ctrl && name.length === 1 && event.sequence) {
    const shiftedLetter = shift && /^[a-z]$/.test(name) && event.sequence === name.toUpperCase();
    if (event.sequence !== name && !shiftedLetter) return null;
  }
  return { name: name.toLowerCase(), ctrl, shift, repeat: event.eventType === "repeat" || event.repeated === true };
}

function claimed(action, reason = null) {
  return { claimed: true, action, reason };
}

function delegated(name, event, context) {
  const handler = callback(context, name);
  if (!handler) return null;
  const result = handler(event, context);
  if (result === true) return claimed(null, name);
  if (result && typeof result === "object" && (result.action || result.claimed !== undefined)) {
    return { claimed: result.claimed !== false, action: result.action ?? null, reason: result.reason ?? name };
  }
  return null;
}

export function routeKey(event, context = {}) {
  const key = normalizeKeyEvent(event);
  if (!key) return { claimed: false, action: null, reason: "unhandled" };
  const rawName = typeof event?.name === "string" ? event.name : "";
  const semanticName = rawName.toLowerCase() === "return" ? "enter" : rawName;
  const normalizedEvent = semanticName === event.name ? event : { ...event, name: semanticName };

  if (key.repeat && key.name !== "up" && key.name !== "down") return { claimed: false, action: null, reason: "repeat-suppressed" };
  if (key.ctrl && key.name === "c") return claimed({ type: "quit", exitCode: 130 }, "ctrl-c");

  for (const [active, name] of [[context.modal, "modalHandler"], [context.textInput, "textInputHandler"], [context.focusedTarget, "focusedTargetHandler"]]) {
    if (active) return delegated(name, normalizedEvent, context) ?? { claimed: true, action: null, reason: name };
  }

  if (key.name === "q") return claimed({ type: "quit", exitCode: 0 }, "quit");
  if (key.name === "escape") {
    return context.error ? claimed({ type: "error/dismiss" }, "dismiss-error") : claimed({ type: "selection/select", selectedId: null }, "clear-selection");
  }
  if (DIGIT_TABS[key.name]) return claimed({ type: "tab/select", tab: DIGIT_TABS[key.name] }, "tab");
  if (key.name === "r") {
    if (context.busy || context.state?.refresh?.pending) return claimed(null, "refresh-busy");
    return claimed({ type: "refresh/request" }, "refresh");
  }
  if (key.name === "tab") {
    const semantic = resolveSemantic(
      key.shift ? context.semantic?.shiftTab ?? context.shiftTab : context.semantic?.tab ?? context.tab,
      normalizedEvent,
      context,
    );
    return semantic ? claimed(semantic, key.shift ? "shift-tab" : "tab-focus") : { claimed: false, action: null, reason: "unhandled" };
  }
  if (key.name === "up" || key.name === "down") {
    const semantic = resolveSemantic(context.semantic?.[key.name] ?? context[key.name], normalizedEvent, context);
    return semantic ? claimed(semantic, key.name) : { claimed: false, action: null, reason: "unhandled" };
  }
  if (key.name === "enter" || key.name === "?") return delegated("actionHandler", normalizedEvent, context) ?? { claimed: false, action: null, reason: "unhandled" };
  if (key.name === "a") return delegated("actionHandler", normalizedEvent, context) ?? { claimed: false, action: null, reason: "unhandled" };
  return { claimed: false, action: null, reason: "unhandled" };
}

export const routeInput = routeKey;
export const normalizeKey = normalizeKeyEvent;

export function validConfirmationInput(value) {
  return typeof value === "string" && value.length <= 160 && !/[\r\n\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

export function confirmationCharacter(event) {
  if (!event || event.ctrl === true || event.meta === true || event.alt === true || event.option === true) return null;
  if (typeof event.sequence === "string" && event.sequence.length > 1) return null;
  if (typeof event.sequence === "string" && event.sequence.length === 1 && !/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(event.sequence)) return event.sequence;
  if (event.name === "space") return " ";
  return typeof event.name === "string" && event.name.length === 1 && !/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(event.name) ? event.name : null;
}

import { applyFillActions, extractPageFields } from "./lib/dom.js";
import type { ExtensionMessage, FillAction } from "./lib/types.js";

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  try {
    if (!isExtensionMessage(message)) {
      sendResponse({ ok: false, error: "Unsupported message." });
      return;
    }

    if (message.type === "EXTRACT_FIELDS") {
      const fields = extractPageFields();
      sendResponse({ ok: true, fields, pageUrl: window.location.href });
      return;
    }

    if (message.type === "FILL_FORM") {
      applyFillActions(message.actions, message.resumeFile);
      sendResponse({ ok: true });
      return;
    }
  } catch (error) {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown content script error" });
  }
});

function isExtensionMessage(message: unknown): message is ExtensionMessage {
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  const type = (message as { type?: unknown }).type;
  if (type === "EXTRACT_FIELDS") return true;
  if (type !== "FILL_FORM") return false;
  return Array.isArray((message as { actions?: FillAction[] }).actions);
}

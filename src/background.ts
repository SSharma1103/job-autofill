chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (typeof message === "object" && message && "type" in message) {
    sendResponse({ ok: true });
  }
});

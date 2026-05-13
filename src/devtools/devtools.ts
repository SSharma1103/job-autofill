if (!chrome.devtools) {
  throw new Error("DevTools APIs are unavailable outside the DevTools page.");
}

chrome.devtools.panels.create("Job Form Filler", "", "src/devtools/panel.html");

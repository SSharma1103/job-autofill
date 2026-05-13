import "./popup.css";
import { getFillActions } from "../lib/api.js";
import {
  getCoverLetterWorkspace,
  getProfile,
  getResumeFile,
  getResumeText,
  getSettings,
  saveCoverLetterWorkspace,
  saveSettings,
} from "../lib/storage.js";
import type { ExtensionSettings, JobApplicationInput, JobApplicationOutput, PageField } from "../lib/types.js";

const fillButton = document.querySelector<HTMLButtonElement>("#fillButton");
const previewButton = document.querySelector<HTMLButtonElement>("#previewButton");
const coverLetterButton = document.querySelector<HTMLButtonElement>("#coverLetterButton");
const optionsButton = document.querySelector<HTMLButtonElement>("#optionsButton");
const useAI = document.querySelector<HTMLInputElement>("#useAI");
const summary = document.querySelector<HTMLElement>("#summary");
const preview = document.querySelector<HTMLPreElement>("#preview");
let currentPreviewFields: PageField[] | undefined;

void init();

async function init(): Promise<void> {
  const settings = await getSettings();
  if (useAI) useAI.checked = Boolean(settings.useAI);

  useAI?.addEventListener("change", async () => {
    await saveSettings({ ...settings, useAI: useAI.checked });
  });
  optionsButton?.addEventListener("click", () => chrome.runtime.openOptionsPage());
  previewButton?.addEventListener("click", () => void previewFields());
  coverLetterButton?.addEventListener("click", () => void openCoverLetterSettings());
  fillButton?.addEventListener("click", () => void fillPage());
}

async function previewFields(): Promise<void> {
  setSummary("Scanning page...");
  const fields = await extractFieldsFromActiveTab();
  currentPreviewFields = fields;
  if (preview) {
    preview.hidden = false;
    preview.textContent = JSON.stringify(fields, null, 2);
  }
  if (coverLetterButton) coverLetterButton.hidden = false;
  setSummary(`${fields.length} fields detected.`);
}

async function openCoverLetterSettings(): Promise<void> {
  try {
    setSummary("Preparing cover letter context...");
    const tab = await getActiveTab();
    const fields = currentPreviewFields ?? (await extractFieldsFromActiveTab());
    const previewText = JSON.stringify(fields, null, 2);
    currentPreviewFields = fields;
    if (preview) {
      preview.hidden = false;
      preview.textContent = previewText;
    }
    if (coverLetterButton) coverLetterButton.hidden = false;

    const workspace = await getCoverLetterWorkspace();
    await saveCoverLetterWorkspace({
      ...workspace,
      context: {
        pageUrl: tab.url,
        fields,
        previewText,
        capturedAt: new Date().toISOString(),
      },
      generateOnOpen: true,
      draft: undefined,
      messages: undefined,
    });
    chrome.runtime.openOptionsPage();
    setSummary("Cover letter context sent to settings.");
  } catch (error) {
    setSummary(error instanceof Error ? error.message : "Unable to prepare cover letter context.");
  }
}

async function fillPage(): Promise<void> {
  try {
    setSummary("Scanning page...");
    const [tab, fields, profile, resumeText, resumeFile, settings] = await Promise.all([
      getActiveTab(),
      extractFieldsFromActiveTab(),
      getProfile(),
      getResumeText(),
      getResumeFile(),
      getSettings(),
    ]);

    const effectiveSettings = { ...settings, useAI: useAI?.checked ?? settings.useAI };
    await saveSettings(effectiveSettings);

    const input: JobApplicationInput = {
      pageUrl: tab.url,
      fields,
      profile,
      resumeText,
      settings: {
        useAI: effectiveSettings.useAI,
        openaiApiKey: effectiveSettings.openaiApiKey,
        modelName: effectiveSettings.modelName,
      },
    };

    setSummary("Preparing fill actions...");
    const output = await getFillActions(input);
    await sendToActiveTab({ type: "FILL_FORM", actions: output.actions, resumeFile });
    renderSummary(output);
  } catch (error) {
    setSummary(error instanceof Error ? error.message : "Unable to fill this page.");
  }
}

async function extractFieldsFromActiveTab(): Promise<PageField[]> {
  const response = (await sendToActiveTab({ type: "EXTRACT_FIELDS" })) as { ok?: boolean; fields?: PageField[]; error?: string };
  if (!response.ok) throw new Error(response.error ?? "Unable to extract fields from this page.");
  return response.fields ?? [];
}

async function getActiveTab(): Promise<{ id: number; url?: string }> {
  const inspectedTabId = chrome.devtools?.inspectedWindow?.tabId;
  if (typeof inspectedTabId === "number") {
    const tab = await chrome.tabs.get(inspectedTabId);
    return { id: inspectedTabId, url: tab.url };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  return { id: tab.id, url: tab.url };
}

async function sendToActiveTab(message: unknown): Promise<unknown> {
  const tab = await getActiveTab();
  if (!canInjectIntoTab(tab.url)) {
    throw new Error("This page cannot be filled by the extension. Open a regular http(s) job application page and try again.");
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    if (!isMissingContentScriptError(error)) throw error;
    await injectContentScript(tab.id);
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["assets/content.js"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to inject the content script.";
    throw new Error(`Unable to access this page. Refresh the tab and try again. ${message}`);
  }
}

function isMissingContentScriptError(error: unknown): boolean {
  return error instanceof Error && /receiving end does not exist|could not establish connection/i.test(error.message);
}

function canInjectIntoTab(url?: string): boolean {
  return Boolean(url && /^(https?:|file:)/i.test(url));
}

function renderSummary(output: JobApplicationOutput): void {
  setSummary(
    [
      `Fields detected: ${output.summary.totalFields}`,
      `Filled: ${output.summary.filled}`,
      `Skipped: ${output.summary.skipped}`,
      `Needs review: ${output.summary.needsReview}`,
      `Resume upload detected: ${output.summary.resumeUploadDetected ? "yes" : "no"}`,
    ].join("\n"),
  );
}

function setSummary(text: string): void {
  if (summary) summary.textContent = text;
}

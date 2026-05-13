import "./options.css";
import {
  clearAllData,
  getCoverLetterWorkspace,
  getProfile,
  getResumeFile,
  getResumeText,
  getSettings,
  saveCoverLetterWorkspace,
  saveProfile,
  saveResumeFile,
  saveResumeText,
  saveSettings,
} from "../lib/storage.js";
import { generateCoverLetter } from "../lib/coverLetter.js";
import { parseResumePdfWithOpenAI } from "../lib/resumeParser.js";
import type { CoverLetterMessage, CoverLetterWorkspace, ExtensionSettings, StoredResumeFile, UserProfile } from "../lib/types.js";

const form = document.querySelector<HTMLFormElement>("#settingsForm");
const customFields = document.querySelector<HTMLElement>("#customFields");
const addCustomField = document.querySelector<HTMLButtonElement>("#addCustomField");
const clearButton = document.querySelector<HTMLButtonElement>("#clearButton");
const clearResumePdfButton = document.querySelector<HTMLButtonElement>("#clearResumePdf");
const resumePdfStatus = document.querySelector<HTMLElement>("#resumePdfStatus");
const coverLetterSection = document.querySelector<HTMLElement>("#coverLetterSection");
const coverLetterContext = document.querySelector<HTMLElement>("#coverLetterContext");
const coverLetterFocus = document.querySelector<HTMLTextAreaElement>("#coverLetterFocus");
const coverLetterOutput = document.querySelector<HTMLTextAreaElement>("#coverLetterOutput");
const coverLetterMessage = document.querySelector<HTMLTextAreaElement>("#coverLetterMessage");
const coverLetterThread = document.querySelector<HTMLElement>("#coverLetterThread");
const generateCoverLetterButton = document.querySelector<HTMLButtonElement>("#generateCoverLetter");
const sendCoverLetterMessageButton = document.querySelector<HTMLButtonElement>("#sendCoverLetterMessage");
const clearCoverLetterButton = document.querySelector<HTMLButtonElement>("#clearCoverLetter");
const status = document.querySelector<HTMLElement>("#status");
let selectedResumeFile: StoredResumeFile | undefined;
let coverLetterWorkspace: CoverLetterWorkspace = {};

void init();

async function init(): Promise<void> {
  const [profile, settings, resumeText, resumeFile, savedCoverLetterWorkspace] = await Promise.all([
    getProfile(),
    getSettings(),
    getResumeText(),
    getResumeFile(),
    getCoverLetterWorkspace(),
  ]);
  selectedResumeFile = resumeFile;
  coverLetterWorkspace = savedCoverLetterWorkspace;
  populateProfile(profile);
  populateSettings(settings);
  setInputValue("resumeText", resumeText);
  renderResumeFileStatus();
  renderCoverLetterWorkspace();
  for (const customField of profile.customFields ?? []) addCustomFieldRow(customField);
  if (!(profile.customFields ?? []).length) addCustomFieldRow();

  addCustomField?.addEventListener("click", () => addCustomFieldRow());
  clearButton?.addEventListener("click", () => void clearData());
  clearResumePdfButton?.addEventListener("click", () => clearResumePdf());
  const resumePdfInput = form?.elements.namedItem("resumePdf");
  if (resumePdfInput instanceof HTMLInputElement) {
    resumePdfInput.addEventListener("change", (event: Event) => void readResumePdf(event));
  }
  generateCoverLetterButton?.addEventListener("click", () => void createCoverLetter());
  sendCoverLetterMessageButton?.addEventListener("click", () => void sendCoverLetterMessage());
  clearCoverLetterButton?.addEventListener("click", () => void clearCoverLetterThread());
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveData();
  });

  if (coverLetterWorkspace.context) setTimeout(() => coverLetterSection?.scrollIntoView({ block: "start" }), 0);
  if (coverLetterWorkspace.context && coverLetterWorkspace.generateOnOpen) {
    void autoGenerateCoverLetter();
  }
}

function populateProfile(profile: UserProfile): void {
  for (const [key, value] of Object.entries(profile)) {
    if (key === "customFields") continue;
    setInputValue(key, value as string | undefined);
  }
}

function populateSettings(settings: ExtensionSettings): void {
  setInputValue("openaiApiKey", settings.openaiApiKey);
  setInputValue("modelName", settings.modelName);
  setChecked("useAI", Boolean(settings.useAI));
  setChecked("requirePreview", settings.requirePreview !== false);
}

async function saveData(): Promise<void> {
  const profile: UserProfile = {
    fullName: getInputValue("fullName"),
    email: getInputValue("email"),
    phone: getInputValue("phone"),
    linkedin: getInputValue("linkedin"),
    github: getInputValue("github"),
    portfolio: getInputValue("portfolio"),
    location: getInputValue("location"),
    currentCompany: getInputValue("currentCompany"),
    currentRole: getInputValue("currentRole"),
    yearsOfExperience: getInputValue("yearsOfExperience"),
    skills: getInputValue("skills"),
    expectedSalary: getInputValue("expectedSalary"),
    noticePeriod: getInputValue("noticePeriod"),
    customFields: readCustomFields(),
  };

  const settings: ExtensionSettings = {
    openaiApiKey: getInputValue("openaiApiKey"),
    modelName: getInputValue("modelName"),
    useAI: getChecked("useAI"),
    requirePreview: getChecked("requirePreview"),
  };

  await Promise.all([
    saveProfile(cleanObject(profile)),
    saveSettings(cleanObject(settings)),
    saveResumeText(getInputValue("resumeText") ?? ""),
    saveResumeFile(selectedResumeFile),
  ]);
  setStatus("Saved.");
}

async function clearData(): Promise<void> {
  await clearAllData();
  selectedResumeFile = undefined;
  form?.reset();
  if (customFields) customFields.innerHTML = "";
  addCustomFieldRow();
  renderResumeFileStatus();
  setStatus("Cleared.");
}

async function readResumePdf(event: Event): Promise<void> {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  if (!file) return;

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    selectedResumeFile = undefined;
    input.value = "";
    renderResumeFileStatus();
    setStatus("Please choose a PDF file.");
    return;
  }

  selectedResumeFile = {
    name: file.name,
    type: "application/pdf",
    size: file.size,
    lastModified: file.lastModified,
    dataUrl: await readFileAsDataUrl(file),
  };
  renderResumeFileStatus();
  await parseSelectedResumePdf();
}

async function parseSelectedResumePdf(): Promise<void> {
  if (!selectedResumeFile) return;

  const apiKey = getInputValue("openaiApiKey");
  if (!apiKey) {
    setStatus("Resume PDF ready. Save an OpenAI API key to parse it automatically.");
    return;
  }

  const resumeFile = selectedResumeFile;
  setStatus("Parsing resume PDF...");

  try {
    const parsedText = await parseResumePdfWithOpenAI({
      apiKey,
      model: getInputValue("modelName") ?? "gpt-4o-mini",
      resumeFile,
    });
    if (selectedResumeFile !== resumeFile) return;

    setInputValue("resumeText", parsedText);
    setStatus("Resume PDF parsed. Save to keep the PDF and parsed text.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse resume PDF.";
    setStatus(`${message} The PDF is ready; save it or paste resume text manually.`);
  }
}

function clearResumePdf(): void {
  selectedResumeFile = undefined;
  const input = form?.elements.namedItem("resumePdf");
  if (input instanceof HTMLInputElement) input.value = "";
  renderResumeFileStatus();
  setStatus("Resume PDF cleared. Save to keep this change.");
}

function renderResumeFileStatus(): void {
  if (!resumePdfStatus) return;
  resumePdfStatus.textContent = selectedResumeFile
    ? `${selectedResumeFile.name} (${formatBytes(selectedResumeFile.size)})`
    : "No PDF selected.";
}

async function createCoverLetter(): Promise<void> {
  await runCoverLetterRequest();
}

async function autoGenerateCoverLetter(): Promise<void> {
  coverLetterWorkspace = { ...coverLetterWorkspace, generateOnOpen: false };
  await saveCoverLetterWorkspace(coverLetterWorkspace);
  await runCoverLetterRequest();
}

async function sendCoverLetterMessage(): Promise<void> {
  const message = coverLetterMessage?.value.trim();
  if (!message) {
    setStatus("Add a message before sending.");
    return;
  }

  const messages = [...(coverLetterWorkspace.messages ?? []), createCoverLetterMessage("user", message)];
  coverLetterWorkspace = { ...coverLetterWorkspace, messages };
  if (coverLetterMessage) coverLetterMessage.value = "";
  await saveCoverLetterWorkspace(coverLetterWorkspace);
  renderCoverLetterWorkspace();
  await runCoverLetterRequest();
}

async function runCoverLetterRequest(): Promise<void> {
  if (!coverLetterWorkspace.context) {
    setStatus("Preview a page first, then use Generate Cover Letter from the popup.");
    return;
  }
  const context = coverLetterWorkspace.context;

  const settings: ExtensionSettings = {
    openaiApiKey: getInputValue("openaiApiKey"),
    modelName: getInputValue("modelName"),
    useAI: getChecked("useAI"),
    requirePreview: getChecked("requirePreview"),
  };
  if (!settings.openaiApiKey) {
    setStatus("Add an OpenAI API key before generating a cover letter.");
    return;
  }

  const focus = coverLetterFocus?.value.trim();
  coverLetterWorkspace = { ...coverLetterWorkspace, focus };
  await saveCoverLetterWorkspace(coverLetterWorkspace);
  setStatus("Generating cover letter...");
  setCoverLetterBusy(true);

  try {
    const profile = cleanObject({
      fullName: getInputValue("fullName"),
      email: getInputValue("email"),
      phone: getInputValue("phone"),
      linkedin: getInputValue("linkedin"),
      github: getInputValue("github"),
      portfolio: getInputValue("portfolio"),
      location: getInputValue("location"),
      currentCompany: getInputValue("currentCompany"),
      currentRole: getInputValue("currentRole"),
      yearsOfExperience: getInputValue("yearsOfExperience"),
      skills: getInputValue("skills"),
      expectedSalary: getInputValue("expectedSalary"),
      noticePeriod: getInputValue("noticePeriod"),
      customFields: readCustomFields(),
    });
    const response = await generateCoverLetter({
      apiKey: settings.openaiApiKey,
      model: settings.modelName ?? "gpt-4o-mini",
      pageUrl: context.pageUrl,
      fields: context.fields,
      previewText: context.previewText,
      profile,
      resumeText: getInputValue("resumeText") ?? "",
      focus,
      messages: coverLetterWorkspace.messages ?? [],
    });
    coverLetterWorkspace = {
      ...coverLetterWorkspace,
      messages: [...(coverLetterWorkspace.messages ?? []), createCoverLetterMessage("assistant", response)],
    };
    await saveCoverLetterWorkspace(coverLetterWorkspace);
    renderCoverLetterWorkspace();
    setStatus("Cover letter ready.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate cover letter.";
    setStatus(message);
  } finally {
    setCoverLetterBusy(false);
  }
}

async function clearCoverLetterThread(): Promise<void> {
  coverLetterWorkspace = { ...coverLetterWorkspace, messages: [] };
  await saveCoverLetterWorkspace(coverLetterWorkspace);
  renderCoverLetterWorkspace();
  setStatus("Cover letter thread cleared.");
}

function renderCoverLetterWorkspace(): void {
  const context = coverLetterWorkspace.context;
  if (coverLetterContext) {
    coverLetterContext.textContent = context
      ? `Preview from ${context.pageUrl ?? "current page"} (${context.fields.length} fields, ${new Date(context.capturedAt).toLocaleString()})`
      : "No preview context yet.";
  }
  if (coverLetterFocus) coverLetterFocus.value = coverLetterWorkspace.focus ?? "";

  const messages = coverLetterWorkspace.messages ?? [];
  const lastDraft = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
  if (coverLetterOutput) coverLetterOutput.value = lastDraft;
  if (!coverLetterThread) return;

  coverLetterThread.innerHTML = "";
  for (const message of messages) {
    const item = document.createElement("div");
    item.className = `thread-message ${message.role}`;
    item.textContent = `${message.role === "user" ? "You" : "Assistant"}: ${message.content}`;
    coverLetterThread.append(item);
  }
}

function createCoverLetterMessage(role: CoverLetterMessage["role"], content: string): CoverLetterMessage {
  return {
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function setCoverLetterBusy(busy: boolean): void {
  if (generateCoverLetterButton) generateCoverLetterButton.disabled = busy;
  if (sendCoverLetterMessageButton) sendCoverLetterMessageButton.disabled = busy;
}

function addCustomFieldRow(value: { key?: string; value?: string; aliases?: string[] } = {}): void {
  if (!customFields) return;
  const row = document.createElement("div");
  row.className = "custom-row";
  row.innerHTML = `
    <label>Key <input data-custom="key" value="${escapeHtml(value.key ?? "")}" /></label>
    <label>Value <input data-custom="value" value="${escapeHtml(value.value ?? "")}" /></label>
    <label>Aliases <input data-custom="aliases" value="${escapeHtml((value.aliases ?? []).join(", "))}" /></label>
    <button type="button" data-custom="remove">Remove</button>
  `;
  row.querySelector<HTMLButtonElement>('[data-custom="remove"]')?.addEventListener("click", () => row.remove());
  customFields.append(row);
}

function readCustomFields(): UserProfile["customFields"] {
  return Array.from(document.querySelectorAll<HTMLElement>(".custom-row"))
    .map((row) => {
      const key = row.querySelector<HTMLInputElement>('[data-custom="key"]')?.value.trim() ?? "";
      const value = row.querySelector<HTMLInputElement>('[data-custom="value"]')?.value.trim() ?? "";
      const aliases = (row.querySelector<HTMLInputElement>('[data-custom="aliases"]')?.value ?? "")
        .split(",")
        .map((alias) => alias.trim())
        .filter(Boolean);
      return { key, value, aliases };
    })
    .filter((field) => field.key && field.value);
}

function getInputValue(name: string): string | undefined {
  return form?.elements.namedItem(name) instanceof HTMLInputElement || form?.elements.namedItem(name) instanceof HTMLTextAreaElement
    ? (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement).value.trim() || undefined
    : undefined;
}

function setInputValue(name: string, value?: string): void {
  const element = form?.elements.namedItem(name);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.value = value ?? "";
}

function getChecked(name: string): boolean {
  const element = form?.elements.namedItem(name);
  return element instanceof HTMLInputElement ? element.checked : false;
}

function setChecked(name: string, checked: boolean): void {
  const element = form?.elements.namedItem(name);
  if (element instanceof HTMLInputElement) element.checked = checked;
}

function cleanObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== "")) as T;
}

function setStatus(message: string): void {
  if (status) status.textContent = message;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read file.")));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

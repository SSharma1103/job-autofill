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
import { parseResumePdfStructuredWithOpenAI } from "../lib/resumeParser.js";
import type { CoverLetterWorkspace, ExtensionSettings, StoredResumeFile, UserProfile } from "../lib/types.js";

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
const coverLetterAiButton = document.querySelector<HTMLButtonElement>("#coverLetterAiButton");
const clearCoverLetterButton = document.querySelector<HTMLButtonElement>("#clearCoverLetter");
const status = document.querySelector<HTMLElement>("#status");
let selectedResumeFile: StoredResumeFile | undefined;
let coverLetterWorkspace: CoverLetterWorkspace = {};

const PROFILE_FIELDS: Array<Exclude<keyof UserProfile, "customFields">> = [
  "fullName",
  "email",
  "phone",
  "linkedin",
  "github",
  "portfolio",
  "location",
  "currentCompany",
  "currentRole",
  "yearsOfExperience",
  "skills",
  "expectedSalary",
  "noticePeriod",
];

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
  coverLetterWorkspace = normalizeCoverLetterWorkspace(savedCoverLetterWorkspace);
  if (savedCoverLetterWorkspace.messages?.length) {
    await saveCoverLetterWorkspace(coverLetterWorkspace);
  }
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
  coverLetterAiButton?.addEventListener("click", () => void askCoverLetterAi());
  clearCoverLetterButton?.addEventListener("click", () => void clearCoverLetterEditor());
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

  coverLetterWorkspace = {
    ...coverLetterWorkspace,
    draft: coverLetterOutput?.value.trim() || undefined,
    focus: coverLetterFocus?.value.trim() || undefined,
    messages: undefined,
  };

  await Promise.all([
    saveProfile(cleanObject(profile)),
    saveSettings(cleanObject(settings)),
    saveResumeText(getInputValue("resumeText") ?? ""),
    saveResumeFile(selectedResumeFile),
    saveCoverLetterWorkspace(coverLetterWorkspace),
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
    const parsedResume = await parseResumePdfStructuredWithOpenAI({
      apiKey,
      model: getInputValue("modelName") ?? "gpt-4o-mini",
      resumeFile,
    });
    if (selectedResumeFile !== resumeFile) return;

    setInputValue("resumeText", parsedResume.resumeText);
    const filledCount = fillEmptyProfileFields(parsedResume.profile);
    setStatus(
      filledCount
        ? `Resume PDF parsed. Filled ${filledCount} profile field${filledCount === 1 ? "" : "s"}. Save to keep these changes.`
        : "Resume PDF parsed. No empty profile fields were filled. Save to keep the PDF and parsed text.",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse resume PDF.";
    setStatus(`${message} The PDF is ready; save it or paste resume text manually.`);
  }
}

function fillEmptyProfileFields(profile: Partial<UserProfile>): number {
  let filledCount = 0;
  for (const field of PROFILE_FIELDS) {
    const value = profile[field]?.trim();
    if (!value || getInputValue(field)) continue;
    setInputValue(field, value);
    filledCount += 1;
  }
  return filledCount;
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

async function autoGenerateCoverLetter(): Promise<void> {
  coverLetterWorkspace = { ...coverLetterWorkspace, generateOnOpen: false };
  await saveCoverLetterWorkspace(coverLetterWorkspace);
  await runCoverLetterRequest();
}

async function askCoverLetterAi(): Promise<void> {
  const instruction = coverLetterMessage?.value.trim();
  const currentDraft = coverLetterOutput?.value.trim();
  if (currentDraft && !instruction) {
    setStatus("Tell AI what to change, or clear the editor to start a fresh draft.");
    return;
  }

  if (coverLetterMessage) coverLetterMessage.value = "";
  await runCoverLetterRequest(instruction || undefined);
}

async function runCoverLetterRequest(instruction?: string): Promise<void> {
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
  const currentDraft = instruction ? coverLetterOutput?.value.trim() : undefined;
  coverLetterWorkspace = {
    ...coverLetterWorkspace,
    focus,
    draft: undefined,
    messages: undefined,
  };
  await saveCoverLetterWorkspace(coverLetterWorkspace);
  setStatus(instruction ? "Updating cover letter..." : "Generating cover letter...");
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
      currentDraft,
      instruction,
    });
    coverLetterWorkspace = {
      ...coverLetterWorkspace,
      draft: response,
      messages: undefined,
    };
    await saveCoverLetterWorkspace(coverLetterWorkspace);
    renderCoverLetterWorkspace();
    setStatus(instruction ? "Cover letter updated." : "Cover letter ready.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate cover letter.";
    setStatus(message);
  } finally {
    setCoverLetterBusy(false);
  }
}

async function clearCoverLetterEditor(): Promise<void> {
  coverLetterWorkspace = { ...coverLetterWorkspace, draft: undefined, messages: undefined };
  await saveCoverLetterWorkspace(coverLetterWorkspace);
  if (coverLetterMessage) coverLetterMessage.value = "";
  renderCoverLetterWorkspace();
  setStatus("Cover letter editor cleared.");
}

function renderCoverLetterWorkspace(): void {
  const context = coverLetterWorkspace.context;
  if (coverLetterContext) {
    coverLetterContext.textContent = context
      ? `Preview from ${context.pageUrl ?? "current page"} (${context.fields.length} fields, ${new Date(context.capturedAt).toLocaleString()})`
      : "No preview context yet.";
  }
  if (coverLetterFocus) coverLetterFocus.value = coverLetterWorkspace.focus ?? "";
  if (coverLetterOutput) coverLetterOutput.value = coverLetterWorkspace.draft ?? "";
}

function normalizeCoverLetterWorkspace(workspace: CoverLetterWorkspace): CoverLetterWorkspace {
  const legacyDraft = [...(workspace.messages ?? [])].reverse().find((message) => message.role === "assistant")?.content;
  return {
    ...workspace,
    draft: workspace.draft ?? legacyDraft,
    messages: undefined,
  };
}

function setCoverLetterBusy(busy: boolean): void {
  if (coverLetterAiButton) coverLetterAiButton.disabled = busy;
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

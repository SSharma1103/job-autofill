import type { CoverLetterWorkspace, ExtensionSettings, StoredResumeFile, UserProfile } from "./types.js";

const PROFILE_KEY = "jobFormFiller.profile";
const SETTINGS_KEY = "jobFormFiller.settings";
const RESUME_TEXT_KEY = "jobFormFiller.resumeText";
const RESUME_FILE_KEY = "jobFormFiller.resumeFile";
const COVER_LETTER_WORKSPACE_KEY = "jobFormFiller.coverLetterWorkspace";

export async function getProfile(): Promise<UserProfile> {
  const data = await chrome.storage.local.get(PROFILE_KEY);
  return (data[PROFILE_KEY] as UserProfile | undefined) ?? {};
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await chrome.storage.local.set({ [PROFILE_KEY]: profile });
}

export async function getSettings(): Promise<ExtensionSettings> {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    requirePreview: true,
    useAI: false,
    modelName: "gpt-4o-mini",
    ...((data[SETTINGS_KEY] as ExtensionSettings | undefined) ?? {}),
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function getResumeText(): Promise<string> {
  const data = await chrome.storage.local.get(RESUME_TEXT_KEY);
  return (data[RESUME_TEXT_KEY] as string | undefined) ?? "";
}

export async function saveResumeText(text: string): Promise<void> {
  await chrome.storage.local.set({ [RESUME_TEXT_KEY]: text });
}

export async function getResumeFile(): Promise<StoredResumeFile | undefined> {
  const data = await chrome.storage.local.get(RESUME_FILE_KEY);
  return data[RESUME_FILE_KEY] as StoredResumeFile | undefined;
}

export async function saveResumeFile(file: StoredResumeFile | undefined): Promise<void> {
  await chrome.storage.local.set({ [RESUME_FILE_KEY]: file });
}

export async function getCoverLetterWorkspace(): Promise<CoverLetterWorkspace> {
  const data = await chrome.storage.local.get(COVER_LETTER_WORKSPACE_KEY);
  return (data[COVER_LETTER_WORKSPACE_KEY] as CoverLetterWorkspace | undefined) ?? {};
}

export async function saveCoverLetterWorkspace(workspace: CoverLetterWorkspace): Promise<void> {
  await chrome.storage.local.set({ [COVER_LETTER_WORKSPACE_KEY]: workspace });
}

export async function clearAllData(): Promise<void> {
  await chrome.storage.local.clear();
}

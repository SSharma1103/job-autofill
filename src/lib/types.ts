import type { FillAction, PageField, StoredResumeFile } from "../../sdk/pipelines/job-application/contracts.js";

export type {
  ExtensionSettings,
  FillAction,
  JobApplicationInput,
  JobApplicationOutput,
  PageField,
  StoredResumeFile,
  UserProfile,
} from "../../sdk/pipelines/job-application/contracts.js";

export type CoverLetterContext = {
  pageUrl?: string;
  fields: PageField[];
  previewText: string;
  capturedAt: string;
};

export type CoverLetterMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type CoverLetterWorkspace = {
  context?: CoverLetterContext;
  draft?: string;
  focus?: string;
  generateOnOpen?: boolean;
  messages?: CoverLetterMessage[];
};

export type ExtensionMessage =
  | { type: "EXTRACT_FIELDS" }
  | {
      type: "FILL_FORM";
      actions: FillAction[];
      resumeFile?: StoredResumeFile;
    };

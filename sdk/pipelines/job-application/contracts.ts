export type UserProfile = {
  fullName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  location?: string;
  currentCompany?: string;
  currentRole?: string;
  yearsOfExperience?: string;
  skills?: string;
  expectedSalary?: string;
  noticePeriod?: string;
  customFields?: Array<{
    key: string;
    value: string;
    aliases?: string[];
  }>;
};

export type ExtensionSettings = {
  openaiApiKey?: string;
  modelName?: string;
  useAI?: boolean;
  requirePreview?: boolean;
};

export type StoredResumeFile = {
  name: string;
  type: "application/pdf";
  size: number;
  lastModified: number;
  dataUrl: string;
};

export type PageField = {
  selector: string;
  tag: "input" | "textarea" | "select" | "contenteditable" | string;
  type?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  label?: string;
  nearbyText?: string;
  options?: string[];
  isFileInput?: boolean;
};

export type FillAction = {
  selector: string;
  action: "fill" | "select" | "check" | "highlight" | "skip";
  value?: string;
  confidence: number;
  source: "rule" | "ai" | "manual" | "system";
  reason?: string;
};

export type JobApplicationInput = {
  pageUrl?: string;
  fields: PageField[];
  profile: UserProfile;
  resumeText?: string;
  settings?: {
    useAI?: boolean;
    openaiApiKey?: string;
    modelName?: string;
  };
};

export type JobApplicationOutput = {
  actions: FillAction[];
  summary: {
    totalFields: number;
    filled: number;
    skipped: number;
    needsReview: number;
    resumeUploadDetected: boolean;
  };
};

export type ProfileFieldKey = Exclude<keyof UserProfile, "customFields"> | `custom:${string}`;

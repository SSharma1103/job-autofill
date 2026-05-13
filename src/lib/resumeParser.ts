import type { StoredResumeFile, UserProfile } from "./types.js";

type ResumeProfileField = Exclude<keyof UserProfile, "customFields">;

export type ParsedResume = {
  resumeText: string;
  profile: Partial<UserProfile>;
};

type ResponseContent = {
  type?: string;
  text?: string;
};

type ResponseOutputItem = {
  content?: ResponseContent[];
};

type OpenAIResponse = {
  output_text?: string;
  output?: ResponseOutputItem[];
  error?: {
    message?: string;
  };
};

const PROFILE_FIELDS: ResumeProfileField[] = [
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

export async function parseResumePdfWithOpenAI(input: {
  apiKey: string;
  model: string;
  resumeFile: StoredResumeFile;
}): Promise<string> {
  return requestResumeParse(input, PLAIN_TEXT_RESUME_PROMPT, 4000);
}

export async function parseResumePdfStructuredWithOpenAI(input: {
  apiKey: string;
  model: string;
  resumeFile: StoredResumeFile;
}): Promise<ParsedResume> {
  const text = await requestResumeParse(input, STRUCTURED_RESUME_PROMPT, 5000);
  return parseStructuredResumeResponse(text);
}

async function requestResumeParse(
  input: {
    apiKey: string;
    model: string;
    resumeFile: StoredResumeFile;
  },
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  const fileData = getPdfDataUrl(input.resumeFile);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: input.resumeFile.name,
              file_data: fileData,
            },
            {
              type: "input_text",
              text: prompt,
            },
          ],
        },
      ],
      max_output_tokens: maxOutputTokens,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as OpenAIResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `OpenAI request failed with ${response.status}.`);
  }

  const text = extractResponseText(data).trim();
  if (!text) throw new Error("OpenAI did not return parsed resume text.");
  return text;
}

export function parseStructuredResumeResponse(text: string): ParsedResume {
  const parsed = parseJsonObject(text);
  if (!parsed) throw new Error("OpenAI did not return valid resume JSON.");

  const resumeText = normalizeProfileValue(parsed.resumeText);
  if (!resumeText) throw new Error("OpenAI did not return parsed resume text.");

  return {
    resumeText,
    profile: sanitizeProfile(parsed.profile),
  };
}

function getPdfDataUrl(resumeFile: StoredResumeFile): string {
  const [header, base64] = resumeFile.dataUrl.split(",");
  if (!header?.startsWith("data:application/pdf") || !base64) throw new Error("Saved resume PDF is invalid.");
  return `data:application/pdf;base64,${base64}`;
}

function extractResponseText(data: OpenAIResponse): string {
  if (data.output_text) return data.output_text;

  return (
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      const parsed = JSON.parse(match[0]);
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}

function sanitizeProfile(value: unknown): Partial<UserProfile> {
  if (!isRecord(value)) return {};

  const profile: Partial<UserProfile> = {};
  for (const field of PROFILE_FIELDS) {
    const normalized = normalizeProfileValue(value[field]);
    if (normalized) profile[field] = normalized;
  }
  return profile;
}

function normalizeProfileValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const items = value
      .map((item) => normalizeProfileValue(item))
      .filter((item): item is string => Boolean(item));
    return items.length ? items.join(", ") : undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const PLAIN_TEXT_RESUME_PROMPT =
  "Extract this resume into faithful plain text for job application form filling. Include contact details, summary, work experience with companies/titles/dates, education, skills, projects, and certifications when present. Do not invent missing details. Return only the extracted resume text.";

const STRUCTURED_RESUME_PROMPT = `Extract this resume for job application form filling.
Return only strict JSON with this shape:
{
  "resumeText": "faithful plain text extracted from the resume",
  "profile": {
    "fullName": "string",
    "email": "string",
    "phone": "string",
    "linkedin": "string",
    "github": "string",
    "portfolio": "string",
    "location": "string",
    "currentCompany": "string",
    "currentRole": "string",
    "yearsOfExperience": "string",
    "skills": "comma-separated string",
    "expectedSalary": "string",
    "noticePeriod": "string"
  }
}
Omit unknown profile fields. Do not invent missing details. Use the most recent role and company for currentRole and currentCompany. Include expectedSalary and noticePeriod only when explicitly present in the resume. Normalize skills into a readable comma-separated string. Do not wrap the JSON in Markdown.`;

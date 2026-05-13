import type { PageField, UserProfile } from "./types.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export async function generateCoverLetter(input: {
  apiKey: string;
  model: string;
  pageUrl?: string;
  fields: PageField[];
  previewText: string;
  profile: UserProfile;
  resumeText: string;
  focus?: string;
  currentDraft?: string;
  instruction?: string;
}): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: buildMessages(input),
      temperature: 0.4,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `OpenAI request failed with ${response.status}.`);
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI did not return a cover letter.");
  return text;
}

export function buildMessages(input: {
  pageUrl?: string;
  fields: PageField[];
  previewText: string;
  profile: UserProfile;
  resumeText: string;
  focus?: string;
  currentDraft?: string;
  instruction?: string;
}): ChatMessage[] {
  const task = input.currentDraft
    ? "Revise the current cover letter draft according to the editor instruction. Return only the full revised cover letter."
    : "Draft a cover letter. Return only the cover letter.";

  return [
    {
      role: "system",
      content:
        "You write concise, truthful cover letters for job applications. Use the provided resume text as source material when available and incorporate relevant resume details into the letter. Use only the provided profile, resume, page preview, current draft, and user instructions. Do not invent companies, dates, credentials, metrics, or experience. If details are missing, keep the wording general.",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task,
          pageUrl: input.pageUrl,
          focus: input.focus,
          instruction: input.instruction,
          profile: input.profile,
          resumeTextForCoverLetter: input.resumeText.slice(0, 8000),
          currentDraft: input.currentDraft,
          preview: input.previewText,
          fields: input.fields,
        },
        null,
        2,
      ),
    },
  ];
}

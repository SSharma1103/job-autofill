import type { CoverLetterMessage, PageField, UserProfile } from "./types.js";

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
  messages: CoverLetterMessage[];
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

function buildMessages(input: {
  pageUrl?: string;
  fields: PageField[];
  previewText: string;
  profile: UserProfile;
  resumeText: string;
  focus?: string;
  messages: CoverLetterMessage[];
}): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "You write concise, truthful cover letters for job applications. Use only the provided profile, resume, page preview, and user instructions. Do not invent companies, dates, credentials, metrics, or experience. If details are missing, keep the wording general.",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task: "Draft or revise a cover letter.",
          pageUrl: input.pageUrl,
          focus: input.focus,
          profile: input.profile,
          resumeText: input.resumeText.slice(0, 8000),
          preview: input.previewText,
          fields: input.fields,
        },
        null,
        2,
      ),
    },
    ...input.messages.map((message): ChatMessage => ({ role: message.role, content: message.content })),
  ];
}

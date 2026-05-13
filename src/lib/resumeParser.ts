import type { StoredResumeFile } from "./types.js";

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

export async function parseResumePdfWithOpenAI(input: {
  apiKey: string;
  model: string;
  resumeFile: StoredResumeFile;
}): Promise<string> {
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
              text:
                "Extract this resume into faithful plain text for job application form filling. Include contact details, summary, work experience with companies/titles/dates, education, skills, projects, and certifications when present. Do not invent missing details. Return only the extracted resume text.",
            },
          ],
        },
      ],
      max_output_tokens: 4000,
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

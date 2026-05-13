type ChatMessage = {
  role: "system" | "user";
  content: string;
};

export type GenerateTextInput = {
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
};

export type GenerateText = (input: GenerateTextInput) => Promise<string>;

export async function generateOpenAIText(input: GenerateTextInput): Promise<string> {
  if (!input.apiKey) throw new Error("OpenAI API key is required when AI is enabled.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI request failed with ${response.status}. ${message.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

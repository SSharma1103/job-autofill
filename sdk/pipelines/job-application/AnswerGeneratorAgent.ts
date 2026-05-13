import type { FillAction, PageField, UserProfile } from "./contracts.js";
import { generateOpenAIText, type GenerateText } from "./openai.js";

type AnswerGeneratorAgentConfig = {
  generateText?: GenerateText;
  model?: string;
};

export class AnswerGeneratorAgent {
  private readonly model: string;

  constructor(private readonly config: AnswerGeneratorAgentConfig = {}) {
    this.model = config.model ?? "gpt-4o-mini";
  }

  async generateAnswer(input: {
    field: PageField;
    profile: UserProfile;
    resumeText?: string;
    openaiApiKey?: string;
    modelName?: string;
  }): Promise<FillAction> {
    if (!isLikelyOpenQuestion(input.field)) {
      return this.skip(input.field, "Field does not look like an open-ended application question.");
    }

    if (!hasEnoughContext(input.profile, input.resumeText)) {
      return this.skip(input.field, "Insufficient profile or resume context to generate a grounded answer.");
    }

    if (!input.openaiApiKey) return this.skip(input.field, "AI is enabled but no OpenAI API key is available.");

    const answer = (
      await (this.config.generateText ?? generateOpenAIText)({
      apiKey: input.openaiApiKey,
      model: input.modelName || this.model,
      messages: [
        {
          role: "system",
          content:
            "Write concise, professional job application answers. Stay grounded in the provided profile and resume. Do not invent degrees, companies, dates, experience, numbers, or credentials. If there is not enough information, say NEEDS_MANUAL_REVIEW.",
        },
        {
          role: "user",
          content: JSON.stringify({
            question: fieldQuestion(input.field),
            profile: compactProfile(input.profile),
            resumeText: input.resumeText?.slice(0, 6000),
            constraints: {
              maxWords: 140,
              output: "Return answer text only, or NEEDS_MANUAL_REVIEW.",
            },
          }),
        },
      ],
      })
    ).trim();
    if (!answer || answer.includes("NEEDS_MANUAL_REVIEW")) {
      return this.skip(input.field, "AI could not generate a grounded answer.");
    }

    return {
      selector: input.field.selector,
      action: "fill",
      value: answer,
      confidence: 0.72,
      source: "ai",
      reason: "Generated grounded answer for open-ended question.",
    };
  }

  private skip(field: PageField, reason: string): FillAction {
    return {
      selector: field.selector,
      action: "highlight",
      confidence: 0.35,
      source: "ai",
      reason,
    };
  }
}

function isLikelyOpenQuestion(field: PageField): boolean {
  if (field.tag !== "textarea" && field.tag !== "contenteditable") return false;
  const text = fieldQuestion(field).toLowerCase();
  return [
    "why do you want",
    "cover letter",
    "tell us about yourself",
    "why should we hire",
    "relevant experience",
    "additional information",
    "summary",
    "motivation",
  ].some((phrase) => text.includes(phrase));
}

function fieldQuestion(field: PageField): string {
  return [field.label, field.placeholder, field.ariaLabel, field.nearbyText, field.name].filter(Boolean).join(" ");
}

function hasEnoughContext(profile: UserProfile, resumeText?: string): boolean {
  return Boolean(profile.fullName || profile.currentRole || profile.skills || profile.currentCompany || (resumeText?.trim().length ?? 0) > 80);
}

function compactProfile(profile: UserProfile): Partial<UserProfile> {
  return Object.fromEntries(
    Object.entries(profile).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return Boolean(value);
    }),
  ) as Partial<UserProfile>;
}

import type { FillAction, PageField, ProfileFieldKey, UserProfile } from "./contracts.js";
import { generateOpenAIText, type GenerateText } from "./openai.js";

type FieldMapperAgentConfig = {
  generateText?: GenerateText;
  model?: string;
};

type AiFillAction = Omit<FillAction, "source"> & {
  source?: "ai";
};

export class FieldMapperAgent {
  private readonly model: string;

  constructor(private readonly config: FieldMapperAgentConfig = {}) {
    this.model = config.model ?? "gpt-4o-mini";
  }

  async mapFields(input: {
    fields: PageField[];
    profile: UserProfile;
    openaiApiKey?: string;
    modelName?: string;
  }): Promise<FillAction[]> {
    if (!input.fields.length) return [];

    if (!input.openaiApiKey) return [];

    const availableKeys = getAvailableProfileKeys(input.profile);
    if (!availableKeys.length) return [];

    const output = await (this.config.generateText ?? generateOpenAIText)({
      apiKey: input.openaiApiKey,
      model: input.modelName || this.model,
      messages: [
        {
          role: "system",
          content:
            "You map job application form fields to profile keys. Return only strict JSON. Do not invent values. Prefer skip or highlight when uncertain.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instructions: [
              "Use only structured field metadata, not page HTML.",
              "Use value as profile:<key> for mapped profile fields, for example profile:email.",
              "Use action fill, select, check, highlight, or skip.",
              "Use confidence from 0 to 1.",
              "Never submit the form.",
              "For file inputs, return highlight with the manual resume upload reason.",
            ],
            availableProfileKeys: availableKeys,
            fields: input.fields.map(stripFieldForAi),
            responseShape: [
              {
                selector: "string",
                action: "fill|select|check|highlight|skip",
                value: "profile:<key> when action uses profile data",
                confidence: 0.8,
                source: "ai",
                reason: "short reason",
              },
            ],
          }),
        },
      ],
    });

    return validateAiActions(output, input.fields, input.profile);
  }
}

function stripFieldForAi(field: PageField): PageField {
  return {
    selector: field.selector,
    tag: field.tag,
    type: field.type,
    id: field.id,
    name: field.name,
    placeholder: field.placeholder,
    ariaLabel: field.ariaLabel,
    label: field.label,
    nearbyText: field.nearbyText,
    options: field.options,
    isFileInput: field.isFileInput,
  };
}

function getAvailableProfileKeys(profile: UserProfile): ProfileFieldKey[] {
  const keys: ProfileFieldKey[] = [];
  for (const key of [
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
  ] as const) {
    if (profile[key]) keys.push(key);
  }

  for (const customField of profile.customFields ?? []) {
    if (customField.key && customField.value) keys.push(`custom:${customField.key}`);
  }

  return keys;
}

function validateAiActions(text: string, fields: PageField[], profile: UserProfile): FillAction[] {
  const parsed = parseJsonArray(text);
  if (!parsed) return [];

  const selectors = new Set(fields.map((field) => field.selector));
  const actions: FillAction[] = [];

  for (const item of parsed) {
    if (!isObject(item)) continue;
    const selector = typeof item.selector === "string" ? item.selector : "";
    const action = typeof item.action === "string" ? item.action : "";
    if (!selectors.has(selector) || !["fill", "select", "check", "highlight", "skip"].includes(action)) continue;

    const confidence = typeof item.confidence === "number" ? clamp(item.confidence) : 0.5;
    const reason = typeof item.reason === "string" ? item.reason : "AI mapping result.";
    const value = typeof item.value === "string" ? resolveProfileReference(item.value, profile) : undefined;
    if (["fill", "select", "check"].includes(action) && !value) continue;

    actions.push({
      selector,
      action: action as FillAction["action"],
      value,
      confidence,
      source: "ai",
      reason,
    });
  }

  return actions;
}

function parseJsonArray(text: string): unknown[] | undefined {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return undefined;
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}

function resolveProfileReference(value: string, profile: UserProfile): string | undefined {
  if (!value.startsWith("profile:")) return undefined;
  const key = value.slice("profile:".length);
  if (key.startsWith("custom:")) {
    const customKey = key.slice("custom:".length);
    return profile.customFields?.find((field) => field.key === customKey)?.value;
  }

  return profile[key as keyof UserProfile] as string | undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

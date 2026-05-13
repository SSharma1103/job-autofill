import type { FillAction, PageField, ProfileFieldKey, UserProfile } from "./contracts.js";

type ProfileCandidate = {
  key: ProfileFieldKey;
  value?: string;
  aliases: string[];
};

type FieldScore = {
  candidate: ProfileCandidate;
  confidence: number;
  reason: string;
};

const BASE_CANDIDATES: Array<Omit<ProfileCandidate, "value">> = [
  {
    key: "fullName",
    aliases: ["full name", "name", "candidate name", "applicant name", "legal name"],
  },
  {
    key: "fullName",
    aliases: ["first name", "given name"],
  },
  {
    key: "fullName",
    aliases: ["last name", "surname", "family name"],
  },
  {
    key: "email",
    aliases: ["email", "email address", "work email", "e-mail"],
  },
  {
    key: "phone",
    aliases: ["phone", "phone number", "mobile", "mobile number", "contact number", "telephone"],
  },
  {
    key: "linkedin",
    aliases: ["linkedin", "linked in", "linkedin profile", "linkedin url"],
  },
  {
    key: "github",
    aliases: ["github", "git hub", "github profile", "github url"],
  },
  {
    key: "portfolio",
    aliases: ["portfolio", "website", "personal site", "personal website", "portfolio url"],
  },
  {
    key: "location",
    aliases: ["location", "city", "address", "current location", "current city"],
  },
  {
    key: "skills",
    aliases: ["skills", "technologies", "tech stack", "technical skills", "tools"],
  },
  {
    key: "yearsOfExperience",
    aliases: ["experience", "years of experience", "total experience", "work experience"],
  },
  {
    key: "currentCompany",
    aliases: ["current company", "employer", "current employer", "company"],
  },
  {
    key: "currentRole",
    aliases: ["current role", "job title", "designation", "current title", "current position"],
  },
  {
    key: "expectedSalary",
    aliases: ["salary", "expected salary", "ctc", "expected ctc", "compensation"],
  },
  {
    key: "noticePeriod",
    aliases: ["notice period", "availability", "available from", "start date"],
  },
];

export class RuleBasedFieldMapper {
  mapFields(fields: PageField[], profile: UserProfile): FillAction[] {
    const candidates = this.buildCandidates(profile);
    return fields.map((field) => this.mapField(field, candidates));
  }

  mapField(field: PageField, candidates: ProfileCandidate[]): FillAction {
    if (field.isFileInput || field.type?.toLowerCase() === "file") {
      return {
        selector: field.selector,
        action: "highlight",
        confidence: 1,
        source: "system",
        reason: "Please manually upload your resume here.",
      };
    }

    const score = this.scoreField(field, candidates);
    if (!score?.candidate.value) {
      return this.unknownAction(field);
    }

    const value = resolveFieldValue(score.candidate, field);
    if (!value) {
      return this.unknownAction(field);
    }

    const optionValue = field.options?.length ? matchOption(field.options, value) : undefined;
    if (field.tag === "select") {
      if (!optionValue) {
        return {
          selector: field.selector,
          action: "highlight",
          confidence: Math.min(score.confidence, 0.55),
          source: "rule",
          reason: `Matched ${score.candidate.key}, but no select option matched confidently.`,
        };
      }

      return {
        selector: field.selector,
        action: "select",
        value: optionValue,
        confidence: score.confidence,
        source: "rule",
        reason: score.reason,
      };
    }

    if (field.type === "checkbox" || field.type === "radio") {
      if (score.confidence < 0.9) {
        return {
          selector: field.selector,
          action: "highlight",
          confidence: score.confidence,
          source: "rule",
          reason: "Checkbox/radio match needs manual review.",
        };
      }

      return {
        selector: field.selector,
        action: "check",
        value: optionValue ?? value,
        confidence: score.confidence,
        source: "rule",
        reason: score.reason,
      };
    }

    return {
      selector: field.selector,
      action: "fill",
      value,
      confidence: score.confidence,
      source: "rule",
      reason: score.reason,
    };
  }

  private buildCandidates(profile: UserProfile): ProfileCandidate[] {
    const candidates = BASE_CANDIDATES.map((candidate) => ({
      ...candidate,
      value: profile[candidate.key as keyof UserProfile] as string | undefined,
    }));

    for (const customField of profile.customFields ?? []) {
      if (!customField.key || !customField.value) continue;
      candidates.push({
        key: `custom:${customField.key}`,
        value: customField.value,
        aliases: [customField.key, ...(customField.aliases ?? [])],
      });
    }

    return candidates.filter((candidate) => Boolean(candidate.value));
  }

  private scoreField(field: PageField, candidates: ProfileCandidate[]): FieldScore | undefined {
    let best: FieldScore | undefined;
    const sources = [
      { name: "label", value: field.label ?? field.ariaLabel, exact: 0.96, partial: 0.9 },
      { name: "placeholder", value: field.placeholder, exact: 0.88, partial: 0.82 },
      { name: "name", value: field.name, exact: 0.86, partial: 0.8 },
      { name: "id", value: field.id, exact: 0.86, partial: 0.8 },
      { name: "nearby text", value: field.nearbyText, exact: 0.68, partial: 0.6 },
    ];

    for (const candidate of candidates) {
      for (const alias of candidate.aliases) {
        const normalizedAlias = normalizeText(alias);
        if (!normalizedAlias) continue;

        for (const source of sources) {
          const normalizedSource = normalizeText(source.value);
          if (!normalizedSource) continue;

          let confidence = 0;
          if (normalizedSource === normalizedAlias) confidence = source.exact;
          else if (containsPhrase(normalizedSource, normalizedAlias)) confidence = source.partial;

          if (!confidence) continue;
          if (!best || confidence > best.confidence) {
            best = {
              candidate,
              confidence,
              reason: `Matched ${candidate.key} from ${source.name}.`,
            };
          }
        }
      }
    }

    return best;
  }

  private unknownAction(field: PageField): FillAction {
    const isOpenQuestion = field.tag === "textarea" || field.tag === "contenteditable";
    return {
      selector: field.selector,
      action: isOpenQuestion ? "highlight" : "skip",
      confidence: isOpenQuestion ? 0.35 : 0.2,
      source: "rule",
      reason: isOpenQuestion ? "Open-ended question needs AI or manual review." : "No confident profile match found.",
    };
  }
}

function resolveFieldValue(candidate: ProfileCandidate, field: PageField): string | undefined {
  if (candidate.key !== "fullName") return candidate.value;

  const context = normalizeText([field.label, field.placeholder, field.name, field.id, field.ariaLabel].join(" "));
  const name = candidate.value?.trim();
  if (!name) return undefined;

  const parts = name.split(/\s+/);
  if (containsPhrase(context, "first name") || containsPhrase(context, "given name")) return parts[0];
  if (containsPhrase(context, "last name") || containsPhrase(context, "surname") || containsPhrase(context, "family name")) {
    return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
  }

  return name;
}

function matchOption(options: string[], value: string): string | undefined {
  const normalizedValue = normalizeText(value);
  return options.find((option) => normalizeText(option) === normalizedValue) ?? options.find((option) => {
    const normalizedOption = normalizeText(option);
    return containsPhrase(normalizedOption, normalizedValue) || containsPhrase(normalizedValue, normalizedOption);
  });
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function containsPhrase(text: string, phrase: string): boolean {
  if (!text || !phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(text);
}

import { AnswerGeneratorAgent } from "./AnswerGeneratorAgent.js";
import { FieldMapperAgent } from "./FieldMapperAgent.js";
import { RuleBasedFieldMapper } from "./RuleBasedFieldMapper.js";
import type { FillAction, JobApplicationInput, JobApplicationOutput, PageField } from "./contracts.js";

type JobApplicationPipelineConfig = {
  ruleMapper?: RuleBasedFieldMapper;
  fieldMapperAgent?: FieldMapperAgent;
  answerGeneratorAgent?: AnswerGeneratorAgent;
};

export class JobApplicationPipeline {
  readonly name = "job-application";
  private readonly ruleMapper: RuleBasedFieldMapper;
  private readonly fieldMapperAgent: FieldMapperAgent;
  private readonly answerGeneratorAgent: AnswerGeneratorAgent;

  constructor(config: JobApplicationPipelineConfig = {}) {
    this.ruleMapper = config.ruleMapper ?? new RuleBasedFieldMapper();
    this.fieldMapperAgent = config.fieldMapperAgent ?? new FieldMapperAgent();
    this.answerGeneratorAgent = config.answerGeneratorAgent ?? new AnswerGeneratorAgent();
  }

  async run(input: JobApplicationInput): Promise<JobApplicationOutput> {
    validateInput(input);

    const ruleActions = this.ruleMapper.mapFields(input.fields, input.profile);
    const actionsBySelector = new Map<string, FillAction>();
    for (const action of ruleActions) {
      if (action.source === "system" || action.confidence >= 0.75) {
        actionsBySelector.set(action.selector, action);
      }
    }

    const useAI = Boolean(input.settings?.useAI && input.settings.openaiApiKey);
    if (useAI) {
      await this.generateOpenQuestionAnswers(input, ruleActions, actionsBySelector);
      await this.mapAmbiguousFields(input, ruleActions, actionsBySelector);
    }

    for (const action of ruleActions) {
      if (!actionsBySelector.has(action.selector)) actionsBySelector.set(action.selector, action);
    }

    const actions = input.fields.map((field) => actionsBySelector.get(field.selector) ?? fallbackAction(field));
    const output = {
      actions,
      summary: summarize(input.fields, actions),
    };

    return output;
  }

  private async generateOpenQuestionAnswers(
    input: JobApplicationInput,
    ruleActions: FillAction[],
    actionsBySelector: Map<string, FillAction>,
  ): Promise<void> {
    const openQuestionFields = input.fields.filter((field) => {
      const ruleAction = ruleActions.find((action) => action.selector === field.selector);
      return isOpenTextField(field) && !field.isFileInput && !isFillAction(ruleAction);
    });

    for (const field of openQuestionFields) {
      const action = await this.answerGeneratorAgent.generateAnswer({
        field,
        profile: input.profile,
        resumeText: input.resumeText,
        openaiApiKey: input.settings?.openaiApiKey,
        modelName: input.settings?.modelName,
      });
      if (isFillAction(action) || action.confidence > (actionsBySelector.get(field.selector)?.confidence ?? 0)) {
        actionsBySelector.set(field.selector, action);
      }
    }
  }

  private async mapAmbiguousFields(
    input: JobApplicationInput,
    ruleActions: FillAction[],
    actionsBySelector: Map<string, FillAction>,
  ): Promise<void> {
    const ambiguousFields = input.fields.filter((field) => {
      const existing = actionsBySelector.get(field.selector);
      const ruleAction = ruleActions.find((action) => action.selector === field.selector);
      return !existing && !field.isFileInput && !isOpenTextField(field) && (ruleAction?.confidence ?? 0) < 0.75;
    });

    if (!ambiguousFields.length) return;

    try {
      const aiActions = await this.fieldMapperAgent.mapFields({
        fields: ambiguousFields,
        profile: input.profile,
        openaiApiKey: input.settings?.openaiApiKey,
        modelName: input.settings?.modelName,
      });

      for (const action of aiActions) {
        if (action.confidence >= 0.65) actionsBySelector.set(action.selector, action);
      }
    } catch {
      // AI mapping is best-effort; rule-based actions remain the fallback.
    }
  }
}

function validateInput(input: JobApplicationInput): void {
  if (!input || !Array.isArray(input.fields) || !input.profile) {
    throw new Error("JobApplicationPipeline input requires fields[] and profile.");
  }
}

function isOpenTextField(field: PageField): boolean {
  return field.tag === "textarea" || field.tag === "contenteditable";
}

function isFillAction(action?: FillAction): boolean {
  return Boolean(action && ["fill", "select", "check"].includes(action.action) && action.value);
}

function fallbackAction(field: PageField): FillAction {
  if (field.isFileInput) {
    return {
      selector: field.selector,
      action: "highlight",
      confidence: 1,
      source: "system",
      reason: "Please manually upload your resume here.",
    };
  }

  return {
    selector: field.selector,
    action: "highlight",
    confidence: 0.2,
    source: "system",
    reason: "No confident mapping found.",
  };
}

function summarize(fields: PageField[], actions: FillAction[]): JobApplicationOutput["summary"] {
  const filled = actions.filter((action) => ["fill", "select", "check"].includes(action.action)).length;
  const skipped = actions.filter((action) => action.action === "skip").length;
  const needsReview = actions.filter((action) => action.action === "highlight" || action.confidence < 0.75).length;
  return {
    totalFields: fields.length,
    filled,
    skipped,
    needsReview,
    resumeUploadDetected: fields.some((field) => field.isFileInput || field.type === "file"),
  };
}

import { RuleBasedFieldMapper } from "../../sdk/pipelines/job-application/RuleBasedFieldMapper.js";
import type { JobApplicationInput, JobApplicationOutput } from "./types.js";

export function ruleBasedMapFields(input: JobApplicationInput): JobApplicationOutput {
  const mapper = new RuleBasedFieldMapper();
  const actions = mapper.mapFields(input.fields, input.profile);
  return {
    actions,
    summary: {
      totalFields: input.fields.length,
      filled: actions.filter((action) => ["fill", "select", "check"].includes(action.action)).length,
      skipped: actions.filter((action) => action.action === "skip").length,
      needsReview: actions.filter((action) => action.action === "highlight" || action.confidence < 0.75).length,
      resumeUploadDetected: input.fields.some((field) => field.isFileInput || field.type === "file"),
    },
  };
}

import { JobApplicationPipeline } from "../../sdk/pipelines/job-application/JobApplicationPipeline.js";
import type { JobApplicationInput, JobApplicationOutput } from "./types.js";

export async function getFillActions(input: JobApplicationInput): Promise<JobApplicationOutput> {
  return new JobApplicationPipeline().run(input);
}

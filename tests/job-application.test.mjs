import test from "node:test";
import assert from "node:assert/strict";
import { RuleBasedFieldMapper, JobApplicationPipeline } from "../dist-node/sdk/index.js";

const profile = {
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  customFields: [{ key: "Work authorization", value: "Yes", aliases: ["authorized to work"] }],
};

test("rule mapper maps email fields to profile email", () => {
  const mapper = new RuleBasedFieldMapper();
  const [action] = mapper.mapFields(
    [{ selector: "#email", tag: "input", type: "email", label: "Email address" }],
    profile,
  );

  assert.equal(action.action, "fill");
  assert.equal(action.value, "ada@example.com");
  assert.equal(action.source, "rule");
});

test("rule mapper extracts first name", () => {
  const mapper = new RuleBasedFieldMapper();
  const [action] = mapper.mapFields(
    [{ selector: "#first", tag: "input", type: "text", label: "First name" }],
    profile,
  );

  assert.equal(action.action, "fill");
  assert.equal(action.value, "Ada");
});

test("rule mapper supports custom field aliases", () => {
  const mapper = new RuleBasedFieldMapper();
  const [action] = mapper.mapFields(
    [{ selector: "#auth", tag: "input", type: "text", label: "Are you authorized to work?" }],
    profile,
  );

  assert.equal(action.action, "fill");
  assert.equal(action.value, "Yes");
});

test("rule mapper highlights file inputs", () => {
  const mapper = new RuleBasedFieldMapper();
  const [action] = mapper.mapFields(
    [{ selector: "#resume", tag: "input", type: "file", label: "Resume", isFileInput: true }],
    profile,
  );

  assert.equal(action.action, "highlight");
  assert.equal(action.source, "system");
  assert.match(action.reason, /manually upload/i);
});

test("pipeline leaves unknown fields for review", async () => {
  const pipeline = new JobApplicationPipeline();
  const output = await pipeline.run({
    fields: [{ selector: "#unknown", tag: "input", type: "text", label: "Favorite keyboard layout" }],
    profile,
  });

  assert.equal(output.actions[0].action, "skip");
  assert.equal(output.summary.needsReview, 1);
});

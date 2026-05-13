import test from "node:test";
import assert from "node:assert/strict";
import { parseStructuredResumeResponse } from "../dist-node/src/lib/resumeParser.js";

test("structured resume parser extracts resume text and supported profile fields", () => {
  const parsed = parseStructuredResumeResponse(
    JSON.stringify({
      resumeText: "Ada Lovelace\nMathematician and programmer.",
      profile: {
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        skills: ["Mathematics", "Analytical engines"],
        customFields: [{ key: "Ignored", value: "Nope" }],
        unknownField: "ignored",
      },
    }),
  );

  assert.equal(parsed.resumeText, "Ada Lovelace\nMathematician and programmer.");
  assert.deepEqual(parsed.profile, {
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    skills: "Mathematics, Analytical engines",
  });
});

test("structured resume parser rejects malformed structured output", () => {
  assert.throws(() => parseStructuredResumeResponse("not json"), /valid resume JSON/);
});

test("structured resume parser requires extracted resume text", () => {
  assert.throws(() => parseStructuredResumeResponse('{"profile":{"fullName":"Ada Lovelace"}}'), /parsed resume text/);
});

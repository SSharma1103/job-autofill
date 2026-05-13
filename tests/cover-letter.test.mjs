import test from "node:test";
import assert from "node:assert/strict";
import { buildMessages } from "../dist-node/src/lib/coverLetter.js";

test("cover letter request includes resume text as source material", () => {
  const messages = buildMessages({
    pageUrl: "https://example.com/jobs/123",
    fields: [{ selector: "#cover-letter", tag: "textarea", label: "Cover letter" }],
    previewText: "Cover letter field",
    profile: { fullName: "Ada Lovelace", currentRole: "Programmer" },
    resumeText: "Built analytical engine programs and wrote technical notes.",
    focus: "Highlight technical writing",
  });

  assert.match(messages[0].content, /resume text as source material/i);

  const requestPayload = JSON.parse(messages[1].content);
  assert.equal(
    requestPayload.resumeTextForCoverLetter,
    "Built analytical engine programs and wrote technical notes.",
  );
});

test("cover letter revisions include the live editor draft and one-shot instruction", () => {
  const messages = buildMessages({
    pageUrl: "https://example.com/jobs/123",
    fields: [{ selector: "#cover-letter", tag: "textarea", label: "Cover letter" }],
    previewText: "Cover letter field",
    profile: { fullName: "Ada Lovelace" },
    resumeText: "Built analytical engine programs.",
    currentDraft: "Dear team,\nOld draft.",
    instruction: "Make this warmer and specific to the role.",
  });

  assert.equal(messages.length, 2);

  const requestPayload = JSON.parse(messages[1].content);
  assert.equal(requestPayload.currentDraft, "Dear team,\nOld draft.");
  assert.equal(requestPayload.instruction, "Make this warmer and specific to the role.");
});

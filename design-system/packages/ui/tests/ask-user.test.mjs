import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AskUser } from "../dist/flow-chat.js";

const questions = [
  {
    customOption: {
      description: "Provide custom text input",
      inputLabel: "Custom version",
      label: "Other",
      placeholder: "Enter a version",
      value: "other",
    },
    id: "version",
    label: "Choose version",
    options: [
      {
        description: "Latest Beta pre-release — newer and has passed basic testing",
        label: "v0.2.19-beta.1 (Recommended)",
        value: "beta",
      },
      {
        description: "The stable release marked as Latest on GitHub — the most stable one",
        label: "v0.2.18",
        value: "stable",
      },
    ],
    prompt: "OPC-Team has three versions — which would you like me to pull?",
    selectionMode: "single",
  },
];

test("AskUser replaces the completed form and legacy summary with only the question and selected answer", () => {
  const markup = renderToStaticMarkup(createElement(AskUser, {
    answers: { version: ["beta"] },
    expanded: true,
    questions,
    state: "completed",
    summaryDetail: "Choose version: v0.2.19-beta.1 (Recommended)",
    summaryLabel: "1 question answered",
  }));

  assert.match(markup, /data-opc-component="ask-user"/);
  assert.match(markup, /data-opc-state="completed"/);
  assert.match(markup, /<dt[^>]*>OPC-Team has three versions — which would you like me to pull\?/);
  assert.match(markup, /data-opc-part="answer-value">v0\.2\.19-beta\.1 \(Recommended\)/);
  assert.doesNotMatch(markup, /<(?:button|input|fieldset|progress|svg)\b/);
  assert.doesNotMatch(markup, /1 question answered|Choose version:|v0\.2\.18|basic testing/);
});

test("AskUser shows all submitted questions, multiple selections, and custom answer text", () => {
  const markup = renderToStaticMarkup(createElement(AskUser, {
    answers: { version: ["beta", "other"], notes: ["custom"] },
    customAnswers: { version: "v0.2.17", notes: "First line\nSecond line" },
    disabled: true,
    questions: [
      { ...questions[0], selectionMode: "multiple" },
      { id: "notes", prompt: "Anything else?", options: [], customOption: { label: "Other", value: "custom" } },
    ],
    state: "submitted",
    header: "Question header",
    statusLabel: "Submitted",
    submitLabel: "Submit",
  }));

  assert.equal((markup.match(/data-opc-part="answer-pair"/g) ?? []).length, 2);
  assert.match(markup, /data-opc-part="answer-value">v0\.2\.19-beta\.1 \(Recommended\)/);
  assert.match(markup, /data-opc-part="answer-value">v0\.2\.17/);
  assert.match(markup, /<dt[^>]*>Anything else\?/);
  assert.match(markup, /data-opc-part="answer-value">First line\nSecond line/);
  assert.doesNotMatch(markup, /<(?:button|input|fieldset|progress|svg)\b|Other|Submit|Question header/);
});

test("AskUser renders a controlled custom answer with an accessible text field", () => {
  const markup = renderToStaticMarkup(createElement(AskUser, {
    answers: { version: ["other"] },
    customAnswers: { version: "v0.2.17" },
    navigation: {
      backLabel: "Back",
      nextLabel: "Next",
      progressLabel: (current, total) => `Question ${current} of ${total}`,
      selectionLabel: (selected, total) => `${selected} of ${total} selected`,
    },
    onAnswersChange: () => undefined,
    onCustomAnswerChange: () => undefined,
    questions,
    state: "asking",
    submitLabel: "Submit",
  }));

  assert.match(markup, /data-custom="true" data-selected="true"/);
  assert.match(markup, /data-opc-part="custom-input"/);
  assert.match(markup, /data-opc-part="question-count"[^>]*>Question 1 of 1/);
  assert.match(markup, /data-opc-name="message-circle-question"/);
  assert.match(markup, /data-opc-part="question-label"[^>]*>.*Choose version/);
  assert.doesNotMatch(markup, /title="Latest Beta|title="The stable release/);
  assert.match(markup, /aria-label="Custom version"/);
  assert.match(markup, /value="v0.2.17"/);
  assert.match(markup, /data-opc-part="submit"/);
  assert.match(markup, /data-opc-component="button"[^>]+data-opc-variant="primary"/);
});

test("AskUser disclosure hides editable controls until expanded and retains the questionnaire footer", () => {
  const props = {
    disclosure: { label: "Skipped · Answer now", collapseLabel: "Collapse questions", skipped: true },
    questions,
    submitLabel: "Send answer",
  };
  const collapsed = renderToStaticMarkup(createElement(AskUser, props));
  assert.match(collapsed, /aria-expanded="false"/);
  assert.match(collapsed, /data-opc-name="message-circle-question"/);
  assert.doesNotMatch(collapsed, /<(?:input|fieldset)\b|data-opc-part="footer"/);
  const expanded = renderToStaticMarkup(createElement(AskUser, { ...props, expanded: true }));
  assert.match(expanded, /aria-expanded="true"/);
  assert.match(expanded, /aria-label="Collapse questions"/);
  assert.match(expanded, /data-opc-name="message-circle-question"/);
  assert.match(expanded, /<fieldset\b/);
  assert.match(expanded, /data-opc-part="footer"/);
});

test("AskUser styles use public semantic and component geometry tokens", async () => {
  const styles = await readFile(new URL("../dist/styles.css", import.meta.url), "utf8");

  assert.match(styles, /--opcteam-control-activity-item-surface-height/);
  assert.match(styles, /--opcteam-control-ask-user-option-padding-block/);
  assert.match(styles, /--opcteam-control-ask-user-question-options-gap/);
  assert.match(styles, /--opcteam-color-surface-subtle/);
  assert.match(styles, /--opcteam-color-action-neutral-content/);
  assert.match(styles, /--opcteam-color-content-muted/);
  assert.match(styles, /--opcteam-color-status-success-content/);
  assert.match(styles, /--opcteam-type-heading-page-line-height/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b|rgba?\(/i);
});

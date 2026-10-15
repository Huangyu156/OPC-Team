import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, PageHeader } from "../dist/index.js";

test("PageHeader decouples heading semantics from visual size", () => {
  const markup = renderToStaticMarkup(
    createElement(PageHeader, {
      description: "Interface language and visual appearance",
      level: 2,
      size: "display",
      title: "Appearance",
    }),
  );

  assert.match(markup, /data-opc-component="page-header"/);
  assert.match(markup, /data-level="2"/);
  assert.match(markup, /data-size="display"/);
  assert.match(markup, /<h2[^>]*data-opc-part="heading"[^>]*>Appearance<\/h2>/);
  assert.match(markup, /data-opc-part="description">Interface language and visual appearance<\/span>/);
});

test("PageHeader exposes alignment and action content independently", () => {
  const markup = renderToStaticMarkup(
    createElement(PageHeader, {
      action: createElement(Button, null, "Close"),
      align: "center",
      leading: createElement("svg", { "aria-hidden": "true" }),
      title: "Good morning, coding partner",
    }),
  );

  assert.match(markup, /data-align="center"/);
  assert.match(markup, /data-opc-part="leading"[^>]*><svg aria-hidden="true"><\/svg>/);
  assert.match(markup, /data-opc-part="action"/);
  assert.match(markup, /<button/);
  assert.match(markup, /data-opc-part="action"[^]*>Close<\/span>/);
});

test("PageHeader marks a required title with a decorative asterisk", () => {
  const markup = renderToStaticMarkup(
    createElement(PageHeader, {
      required: true,
      title: "Provider name",
    }),
  );

  assert.match(markup, /data-required="true"/);
  assert.match(
    markup,
    /data-opc-part="heading"[^>]*>Provider name<span aria-hidden="true"[^>]*data-opc-part="required"[^>]*>\*<\/span><\/h1>/,
  );
});

test("PageHeader omits the required marker by default", () => {
  const markup = renderToStaticMarkup(
    createElement(PageHeader, { title: "Appearance" }),
  );

  assert.match(markup, /data-required="false"/);
  assert.doesNotMatch(markup, /data-opc-part="required"/);
});

test("PageHeader styles use shared typography and content tokens", async () => {
  const styles = await readFile(new URL("../src/components/PageHeader/PageHeader.module.css", import.meta.url), "utf8");

  assert.match(styles, /--opcteam-type-heading-page-font-size/);
  assert.match(styles, /--opcteam-type-heading-section-font-size/);
  assert.match(styles, /--opcteam-type-heading-display-font-size/);
  assert.match(styles, /--opcteam-type-heading-welcome-font-size/);
  assert.match(styles, /--opcteam-type-body-lg-font-size/);
  assert.match(styles, /--opcteam-color-content-primary/);
  assert.match(styles, /--opcteam-color-content-muted/);
  assert.match(styles, /--opcteam-color-content-required-indicator/);
});

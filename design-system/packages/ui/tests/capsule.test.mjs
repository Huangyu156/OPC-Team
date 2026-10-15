import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { Button, Capsule, Icon, IconButton, MultiSelect, TabGroup, Tooltip } from "../dist/index.js";

const action = (props = {}) => h(IconButton, {
  "aria-label": "Remove provider", icon: h(Icon, { name: "delete" }), ...props,
});

test("a tooltip-wrapped capsule action keeps its accessible name and destructive state with shared glass presentation", () => {
  const markup = renderToStaticMarkup(h(Capsule, {
    size: "sm",
    action: h(Tooltip, { content: "Remove provider" }, action({ tone: "danger", variant: "fill", loading: true })),
  }, h(Button, { size: "sm", "aria-label": "Edit provider" }, "Long provider name")));
  assert.match(markup, /data-opc-component="capsule"/);
  assert.match(markup, /data-opc-part="action"/);
  assert.match(markup, /data-opc-variant="glass"/);
  assert.match(markup, /data-opc-shape="circle"/);
  assert.match(markup, /data-opc-tone="danger"/);
  assert.match(markup, /aria-label="Remove provider"/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /Long provider name/);
  assert.equal((markup.match(/<button\b/g) ?? []).length, 2);
  assert.ok(markup.indexOf("</button>") < markup.lastIndexOf("<button"), "Primary and secondary actions must be siblings");
});

test("capsules without actions preserve ordinary content and do not add a focus target", () => {
  const markup = renderToStaticMarkup(h(Capsule, { size: "xs" }, "A tag"));
  assert.match(markup, />A tag<\/span>/);
  assert.doesNotMatch(markup, /tabindex|role=|data-opc-part="action"/);
});

test("tab actions and removable MultiSelect labels adopt the same glass presentation", () => {
  const tabs = renderToStaticMarkup(h(TabGroup, { items: [{ value: "a", label: "A long tab", endAction: action({ variant: "outline" }) }] }));
  assert.match(tabs, /data-opc-variant="glass"/);
  assert.match(tabs, /role="tab"/);
  assert.match(tabs, /A long tab/);

  const select = renderToStaticMarkup(h(MultiSelect, {
    "aria-label": "Tags", value: ["a"], options: [{ value: "a", label: "A long tag" }], disabled: true,
  }));
  assert.match(select, /data-opc-component="capsule"/);
  assert.match(select, /data-opc-variant="glass"/);
  assert.match(select, /A long tag/);
  assert.match(select, /disabled=""/);
});

test("a standalone icon retains its chosen variant outside a floating action slot", () => {
  const markup = renderToStaticMarkup(action({ variant: "outline" }));
  assert.match(markup, /data-opc-variant="outline"/);
  assert.doesNotMatch(markup, /data-opc-variant="glass"/);
});

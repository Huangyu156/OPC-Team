import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import { collectForwardedTabProps, collectForwardedOverlayProps, collectForwardedFlowGroupParts, findDomAttribute, collectFlowChatAppearanceHostTags } from './appearance-dom-contracts.mjs';

test('FlowChat host evidence follows exact public imports, including aliases, but rejects local lookalikes', () => {
  const parse = source => [...collectFlowChatAppearanceHostTags(ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX))];
  assert.deepEqual(parse(`import { ThinkingBlock as Reasoning, ExploreGroup, ToolDuration } from '@openbitfun/ui/flow-chat';`), ['Reasoning', 'ExploreGroup', 'ToolDuration']);
  assert.deepEqual(parse(`import { ThinkingBlock } from './fake'; import { Unknown } from '@openbitfun/ui/flow-chat';`), []);
});

const flowGroupSource = fs.readFileSync(new URL('../design-system/packages/ui/src/flow-chat/conversation/FlowGroup.tsx', import.meta.url), 'utf8');
const parseTsx = source => ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

test('FlowGroup forwards literal identities to the actual public parts and state source', () => {
  const [parts] = collectForwardedFlowGroupParts(parseTsx(`import { FlowGroup as Group } from '@openbitfun/ui/flow-chat';
    <Group {...props} data-opc-component="explore-group" data-opc-part="root" />;`), parseTsx(flowGroupSource)).values();
  assert.deepEqual(parts.map(node => findDomAttribute(node, 'data-opc-part').initializer.text),
    ['root', 'header', 'summary', 'controls', 'contentWrapper', 'content']);
  assert.match(findDomAttribute(parts[0], 'data-opc-state').getText(), /expanded/);
  // Removing forwarding at the owner removes the proof; an inventory is not DOM evidence.
  const changedOwner = flowGroupSource.replace('data-opc-part="summary"', 'data-other-part="summary"');
  const [changedParts] = collectForwardedFlowGroupParts(parseTsx(`import { FlowGroup } from '@openbitfun/ui/flow-chat';
    <FlowGroup data-opc-component="context-load-group" data-opc-part="root" />;`), parseTsx(changedOwner)).values();
  assert.equal(changedParts.length, parts.length - 1);
});

test('FlowGroup forwarding rejects local lookalikes, dynamic identities and overriding spreads', () => {
  for (const source of [
    `import { FlowGroup } from './fake'; <FlowGroup data-opc-component="x" data-opc-part="root" />;`,
    `import { Button as FlowGroup } from '@openbitfun/ui/flow-chat'; <FlowGroup data-opc-component="x" data-opc-part="root" />;`,
    `import { FlowGroup } from '@openbitfun/ui/flow-chat'; <FlowGroup data-opc-component={dynamic} data-opc-part="root" />;`,
    `import { FlowGroup } from '@openbitfun/ui/flow-chat'; <FlowGroup data-opc-component="x" data-opc-part="root" {...unknown} />;`,
    `import { FlowGroup } from '@openbitfun/ui/flow-chat'; <FlowGroup data-opc-component="x" data-opc-part="invented" />;`,
  ]) assert.equal(collectForwardedFlowGroupParts(parseTsx(source), parseTsx(flowGroupSource)).size, 0, source);
});

function collect(source) {
  return [...collectForwardedTabProps(ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX))];
}

test('Dialog overlay props prove only forwarded product markers, not overridden library markers', () => {
  const parse = source => [...collectForwardedOverlayProps(ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX))];
  for (const component of ['Dialog', 'Sheet']) {
    const [node] = parse(`import { ${component} as Surface } from '@openbitfun/ui'; <Surface overlayProps={{'data-opc-product-part': 'lightbox', 'data-opc-component': 'fake', 'data-state': 'fake'}} />;`);
    assert.equal(findDomAttribute(node, 'data-opc-product-part').initializer.text, 'lightbox');
    assert.equal(findDomAttribute(node, 'data-opc-component'), undefined);
    assert.equal(findDomAttribute(node, 'data-state'), undefined);
  }
  for (const source of [
    `import { Dialog } from './fake'; <Dialog overlayProps={{part: 'fake'}} />;`,
    `import { Button } from '@openbitfun/ui'; <Button overlayProps={{part: 'fake'}} />;`,
    `import { Dialog } from '@openbitfun/ui'; <Dialog other={{part: 'fake'}} />;`,
    `import { Dialog } from '@openbitfun/ui'; <Dialog overlayProps={{part: 'fake', ...unknown}} />;`,
    `import { Dialog } from '@openbitfun/ui'; <Dialog overlayProps={{part: 'fake'}} {...unknown} />;`,
    `const unused = {overlayProps: {part: 'fake'}};`,
  ]) assert.equal(parse(source).length, 0, source);
});

test('TabGroup literal and mapped items expose the real native tab attributes', () => {
  for (const items of [
    `[{value: 'models', tabProps: {'data-opc-product-part': 'tab'}}]`,
    `tabs.map(tab => ({value: tab, tabProps: {'data-opc-product-part': 'tab'}}))`,
  ]) {
    const nodes = collect(`import { TabGroup as Tabs } from '@openbitfun/ui'; <Tabs items={${items}} />;`);
    assert.equal(nodes.length, 1);
    assert.equal(findDomAttribute(nodes[0], 'data-opc-product-part').initializer.text, 'tab');
    assert.equal(findDomAttribute(nodes[0], 'missing'), undefined);
  }
});

test('unrelated objects, non-forwarding props and unknown spreads cannot establish DOM contracts', () => {
  for (const source of [
    `const unused = {tabProps: {'data-opc-product-part': 'tab'}};`,
    `import { TabGroup } from './fake'; <TabGroup items={[{tabProps: {part: 'tab'}}]} />;`,
    `import { Button } from '@openbitfun/ui'; <Button items={[{tabProps: {part: 'tab'}}]} />;`,
    `import { TabGroup } from '@openbitfun/ui'; <TabGroup other={[{tabProps: {part: 'tab'}}]} />;`,
    `import { TabGroup } from '@openbitfun/ui'; <TabGroup items={[{tabProps: {part: 'tab'}, ...unknown}]} />;`,
    `import { TabGroup } from '@openbitfun/ui'; <TabGroup items={[{tabProps: {part: 'tab', ...unknown}}]} />;`,
    `import { TabGroup } from '@openbitfun/ui'; <TabGroup items={[{label: {tabProps: {part: 'tab'}}}]} />;`,
  ]) assert.equal(collect(source).length, 0, source);
});

test('component-owned part and value markers cannot be supplied as forwarding evidence', () => {
  const [node] = collect(`import { TabGroup } from '@openbitfun/ui';
    <TabGroup items={[{value: 'models', tabProps: {
      'data-opc-part': 'invented', 'data-opc-value': 'invented',
      'data-opc-product-part': 'tab'
    }}]} />;`);
  assert.equal(findDomAttribute(node, 'data-opc-part'), undefined);
  assert.equal(findDomAttribute(node, 'data-opc-value'), undefined);
  assert.equal(findDomAttribute(node, 'data-opc-product-part').initializer.text, 'tab');
});

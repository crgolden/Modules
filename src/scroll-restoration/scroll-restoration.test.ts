import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BEFORE_UNLOAD_EVENT,
  ScrollRestorationModes,
  handScrollRestorationToTheBrowserOnLeave,
  type LeavableWindow,
} from './index';

interface FakeWindow extends LeavableWindow {
  leave(): void;
  navigate(): void;
}

function aWindowTheRouterOwns(): FakeWindow {
  const target = new EventTarget();
  const navigationListeners: (() => void)[] = [];
  const fake: FakeWindow = {
    history: { scrollRestoration: ScrollRestorationModes.manual },
    addEventListener: (type, listener) => target.addEventListener(type, listener),
    leave: () => target.dispatchEvent(new Event(BEFORE_UNLOAD_EVENT)),
    navigate: () => navigationListeners.forEach((listener) => listener()),
  };
  handScrollRestorationToTheBrowserOnLeave(fake, (reclaim) => navigationListeners.push(reclaim));
  return fake;
}

test('leaving the document hands restoration to the browser', () => {
  const fake = aWindowTheRouterOwns();

  fake.leave();

  assert.equal(fake.history.scrollRestoration, ScrollRestorationModes.auto);
});

test('the router keeps restoration while the document is alive', () => {
  const fake = aWindowTheRouterOwns();

  assert.equal(fake.history.scrollRestoration, ScrollRestorationModes.manual);
});

test('the next navigation reclaims restoration after a leave that never left', () => {
  const fake = aWindowTheRouterOwns();
  fake.leave();

  fake.navigate();

  assert.equal(fake.history.scrollRestoration, ScrollRestorationModes.manual);
});

test('the published core is CommonJS rather than an ES module Node had to detect', () => {
  const published: unknown = require('../../dist/scroll-restoration/index.js');

  assert.equal(Object.getPrototypeOf(published), Object.prototype);
});

test('a bundler importing the core gets an ES module and Node requiring it gets CommonJS', () => {
  const manifest = require('../../package.json') as { exports: Record<string, Record<string, string>> };
  const entry = manifest.exports['./scroll-restoration'];
  const imported: unknown = require(`../../${entry['import']}`);
  const required: unknown = require(`../../${entry['default']}`);

  assert.equal(Object.getPrototypeOf(imported), null);
  assert.equal(Object.getPrototypeOf(required), Object.prototype);
});

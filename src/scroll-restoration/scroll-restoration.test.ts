import assert from 'node:assert/strict';
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

function leavingTheDocumentHandsRestorationToTheBrowser(): void {
  const fake = aWindowTheRouterOwns();

  fake.leave();

  assert.equal(fake.history.scrollRestoration, ScrollRestorationModes.auto);
}

function theRouterKeepsRestorationWhileTheDocumentIsAlive(): void {
  const fake = aWindowTheRouterOwns();

  assert.equal(fake.history.scrollRestoration, ScrollRestorationModes.manual);
}

function theNextNavigationReclaimsRestorationAfterALeaveThatNeverLeft(): void {
  const fake = aWindowTheRouterOwns();
  fake.leave();

  fake.navigate();

  assert.equal(fake.history.scrollRestoration, ScrollRestorationModes.manual);
}

function thePublishedCoreIsCommonJsRatherThanAnEsModuleNodeHadToDetect(): void {
  const published: unknown = require('../../dist/scroll-restoration/index.js');

  assert.notEqual(Object.prototype.toString.call(published), '[object Module]');
}

leavingTheDocumentHandsRestorationToTheBrowser();
theRouterKeepsRestorationWhileTheDocumentIsAlive();
theNextNavigationReclaimsRestorationAfterALeaveThatNeverLeft();
thePublishedCoreIsCommonJsRatherThanAnEsModuleNodeHadToDetect();
console.log('scroll-restoration: the browser restores across a document leave and the router reclaims on navigation');

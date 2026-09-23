import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import { createRng, pickFromPrefix } from './index';

const SEED = 1;
const TILE_ID_PREFIX = 'catalog-title-';
const FIRST_TILE_ID = `${TILE_ID_PREFIX}0`;

interface StubbedPage {
  readonly page: Page;
  readonly calls: readonly string[];
}

function pageWhoseTilesArriveOnlyOnceWaitedFor(): StubbedPage {
  const calls: string[] = [];
  let tileHasArrived = false;

  const locator = {
    first: () => ({
      waitFor: async () => {
        calls.push('waitFor');
        tileHasArrived = true;
      },
    }),
    count: async () => {
      calls.push('count');
      return Number(tileHasArrived);
    },
    nth: (index: number) => ({ id: `${TILE_ID_PREFIX}${index}` }),
  };

  return {
    page: { locator: () => locator } as unknown as Page,
    calls,
  };
}

async function aTileArrivingAfterTheWalkHasAskedForOne(): Promise<void> {
  const { page, calls } = pageWhoseTilesArriveOnlyOnceWaitedFor();

  const picked = (await pickFromPrefix(page, createRng(SEED), TILE_ID_PREFIX)) as unknown as {
    id: string;
  };

  assert.equal(picked.id, FIRST_TILE_ID);
  assert.ok(
    calls.indexOf('waitFor') < calls.indexOf('count'),
    `pickFromPrefix counted before waiting, so the count describes a DOM that may still be filling: ${JSON.stringify(calls)}`,
  );
}

aTileArrivingAfterTheWalkHasAskedForOne()
  .then(() => {
    console.log('pick-from-prefix: a tile arriving mid-pick is waited for, not counted past');
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

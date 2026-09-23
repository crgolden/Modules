import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createRng, pickFromPrefix } from './index';

const SEED = 1;
const TILE_ID_PREFIX = 'catalog-title-';
const FIRST_TILE_ID = `${TILE_ID_PREFIX}0`;

async function tileArrivingAfterTheWalkHasAskedForOne(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.setContent('<main id="grid"></main>');

    const picked = pickFromPrefix(page, createRng(SEED), TILE_ID_PREFIX);

    await page.evaluate(id => {
      const tile = document.createElement('a');
      tile.id = id;
      tile.textContent = id;
      document.getElementById('grid')?.append(tile);
    }, FIRST_TILE_ID);

    const locator = await picked;
    assert.equal(await locator.getAttribute('id'), FIRST_TILE_ID);
  } finally {
    await browser.close();
  }
}

tileArrivingAfterTheWalkHasAskedForOne()
  .then(() => {
    console.log('pick-from-prefix: a tile arriving mid-pick is waited for, not thrown on');
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

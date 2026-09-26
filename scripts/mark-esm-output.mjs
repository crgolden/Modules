import { writeFileSync } from 'node:fs';

writeFileSync(new URL('../dist/esm/package.json', import.meta.url), `${JSON.stringify({ type: 'module' })}\n`);

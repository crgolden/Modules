import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { SourceFile } from './utilities';

export interface DesignSourceRoots {
  readonly repoRoot: string;
  readonly sourceRoot: string;
  readonly builtRoot: string;
  readonly packageRoots?: readonly string[];
}

export interface DesignSources {
  readonly builtStylesheets: readonly SourceFile[];
  readonly templates: readonly SourceFile[];
  readonly hostSources: readonly SourceFile[];
}

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', '.angular']);
const UNIT_SPEC = /\.(?:spec|test)\.ts$/;

function filesUnder(directory: string, keep: (path: string) => boolean): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return SKIPPED_DIRECTORIES.has(entry) ? [] : filesUnder(full, keep);
    return keep(full) ? [full] : [];
  });
}

function read(repoRoot: string, paths: readonly string[]): SourceFile[] {
  return paths.map((path) => ({
    path: relative(repoRoot, path).replace(/\\/g, '/'),
    text: readFileSync(path, 'utf8').replace(/\r\n/g, '\n'),
  }));
}

export function collectDesignSources(roots: DesignSourceRoots): DesignSources {
  const packageScripts = (roots.packageRoots ?? []).flatMap((root) => filesUnder(root, (path) => path.endsWith('.js')));
  return {
    builtStylesheets: read(roots.repoRoot, filesUnder(roots.builtRoot, (path) => path.endsWith('.css'))),
    templates: read(roots.repoRoot, filesUnder(roots.sourceRoot, (path) => path.endsWith('.html'))),
    hostSources: read(roots.repoRoot, [
      ...filesUnder(roots.sourceRoot, (path) => path.endsWith('.ts') && !UNIT_SPEC.test(path)),
      ...packageScripts,
    ]),
  };
}

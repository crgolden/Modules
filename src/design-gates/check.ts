import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { collectDesignSources } from './sources';
import { unconsumedThemeTokens } from './theme-tokens';
import { analyzeUtilities } from './utilities';

export interface DesignUtilitiesCheckOptions {
  readonly repoRoot: string;
}

export interface DesignUtilitiesCheck {
  readonly passed: boolean;
  readonly report: readonly string[];
}

export const SOURCE_DIRECTORY = 'src';
export const BUILT_DIRECTORY = 'dist';
export const THEME_STYLESHEET = 'styles.css';
const PRIMITIVES_PACKAGE_PATH = ['node_modules', '@crgolden', 'modules', 'dist', 'primitives'];

const failed = (report: string[]): DesignUtilitiesCheck => ({ passed: false, report });

export function checkDesignUtilities(options: DesignUtilitiesCheckOptions): DesignUtilitiesCheck {
  const sourceRoot = join(options.repoRoot, SOURCE_DIRECTORY);
  const builtRoot = join(options.repoRoot, BUILT_DIRECTORY);
  if (!existsSync(builtRoot)) {
    return failed([`FAIL: no ${BUILT_DIRECTORY}/. This check reads the CSS the browser gets, so it runs after a build.`]);
  }
  const { builtStylesheets, templates, hostSources } = collectDesignSources({
    repoRoot: options.repoRoot,
    sourceRoot,
    builtRoot,
    packageRoots: [join(options.repoRoot, ...PRIMITIVES_PACKAGE_PATH)],
  });
  if (builtStylesheets.length === 0) {
    return failed([
      `FAIL: ${BUILT_DIRECTORY}/ contains no .css, and a zero-stylesheet run would pass every class vacuously.`,
    ]);
  }
  const report = [
    `Reading ${builtStylesheets.length} built stylesheet(s), ${templates.length} template(s) and ` +
      `${hostSources.length} host source(s).`,
  ];
  const { failures, templateClassCount } = analyzeUtilities({ stylesheets: builtStylesheets, templates, hostSources });
  if (failures.length > 0) {
    return failed([...report, `FAIL: ${failures.length} design failure(s).`, ...failures.map((failure) => `  ${failure}`)]);
  }
  const unconsumed = unconsumedThemeTokens({
    themeCss: readFileSync(join(sourceRoot, THEME_STYLESHEET), 'utf8').replace(/\r\n/g, '\n'),
    stylesheets: builtStylesheets.map(({ text }) => text),
  });
  if (unconsumed.length > 0) {
    return failed([
      ...report,
      `FAIL: ${unconsumed.length} @theme token(s) declared but read by nothing that ships.`,
      ...unconsumed.map((token) => `  ${token}`),
    ]);
  }
  return {
    passed: true,
    report: [...report, `OK: all ${templateClassCount} template and host classes reach shipped CSS, and every @theme token is read.`],
  };
}

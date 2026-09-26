import { withoutComments } from './utilities';

const THEME_BLOCK = /@theme\b[^{]*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
const THEME_TOKEN = /^\s*(--[a-z0-9-]+)\s*:/gim;

export const BUILD_TIME_THEME_NAMESPACES: readonly RegExp[] = [/^--breakpoint-/];

export const INLINED_THEME_NAMESPACES: readonly string[] = ['--inset-shadow-', '--drop-shadow-', '--text-shadow-', '--shadow-'];

function namesItsUtility(token: string, body: string): boolean {
  const utility = token.slice('--'.length);
  return new RegExp(`[.:]${utility}(?![a-z0-9-])`).test(body);
}

export interface UnconsumedThemeTokensOptions {
  readonly themeCss: string;
  readonly stylesheets: readonly string[];
  readonly allowedUnconsumed?: ReadonlySet<string>;
}

export function themeTokensIn(css: string): string[] {
  return [...withoutComments(css).matchAll(THEME_BLOCK)].flatMap(([, body]) =>
    [...body.matchAll(THEME_TOKEN)].map(([, name]) => name),
  );
}

export function unconsumedThemeTokens(options: UnconsumedThemeTokensOptions): string[] {
  const body = withoutComments(options.stylesheets.join('\n'));
  const allowed = options.allowedUnconsumed ?? new Set<string>();
  return themeTokensIn(options.themeCss).filter((token) => {
    if (allowed.has(token)) return false;
    if (BUILD_TIME_THEME_NAMESPACES.some((namespace) => namespace.test(token))) return false;
    const readThroughVar = new RegExp(`var\\(\\s*${token}(?![a-z0-9-])`, 'i').test(body);
    if (INLINED_THEME_NAMESPACES.some((namespace) => token.startsWith(namespace))) {
      return !readThroughVar && !namesItsUtility(token, body);
    }
    return !readThroughVar;
  });
}

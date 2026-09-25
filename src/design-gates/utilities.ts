export interface SourceFile {
  readonly path: string;
  readonly text: string;
}

export interface UtilitiesOptions {
  readonly stylesheets: readonly SourceFile[];
  readonly templates: readonly SourceFile[];
  readonly hostSources: readonly SourceFile[];
  readonly allowedUndeclared?: ReadonlySet<string>;
  readonly allowedScoped?: ReadonlySet<string>;
}

export interface UtilitiesResult {
  readonly failures: readonly string[];
  readonly allowedScopedSeen: readonly string[];
  readonly templateClassCount: number;
}

const RULE_BLOCK = /([^{}]+)\{([^{}]*)\}/g;
const CLASS_ATTRIBUTE = /\bclass\s*=\s*("[^"]*"|'[^']*')/g;
const CLASS_BINDING = /\[class\.([a-z][a-z0-9-]*)\]/gi;
const NG_CLASS_ATTRIBUTE = /\[ngClass\]\s*=\s*("[^"]*"|'[^']*')/g;
const QUOTED_LITERAL = /'([^']*)'|"([^"]*)"/g;
const UNANALYZABLE_CLASS_BINDING = /\[class\]\s*=/;
const CLASS_TOKEN_NAME = /^(?:(?:[a-z][a-z0-9-]*|\[[^\]]*\]):)*[a-z][a-z0-9-]*(?:\[[^\]]*\]|\([^)]*\))?$/i;
const HOST_BLOCK = /\bhost\s*:\s*\{([^}]*)\}/g;
const HOST_CLASS_KEY = /(?:^|[\s,{])(?:class|'class')\s*:/;
const HOST_CLASS_LITERAL = /(?:^|[\s,{])(?:class|'class')\s*:\s*'([^']*)'/;
const HOST_CLASS_BINDING_KEY = /'\[class\.([^'\]]+(?:\[[^\]']*\][^'\]]*)*)\]'/gi;
const COMPILED_CLASS_ATTRIBUTE = /\bclassAttribute\s*:\s*"([^"]*)"/g;
const COMPILED_CLASS_ATTRIBUTE_ONCE = /\bclassAttribute\s*:\s*"([^"]*)"/;
const COMPILED_SUFFIX = '.js';
const DIRECTIVE_DECLARATION = /\bselector\s*:\s*(['"])([^'"]*)\1[\s\S]*?\bhost\s*:\s*\{([^}]*)\}/g;
const SELECTOR_ATTRIBUTE = /\[([\w-]+)\]/g;
const OPENING_TAG = /<[a-z][\w-]*\b([^>]*)>/gi;
const STATIC_CLASS_ATTRIBUTE = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const DECLARED_PROPERTY = /(?:^|;)\s*([a-z-]+)\s*:/g;
const VARIANT_SEPARATOR = ':';
const Z_INDEX_UTILITY = /^-?z-/;
const LADDER_Z_INDEX = /(?:^|;)\s*z-index\s*:\s*var\(\s*--z-/;

const escapeForRegExp = (className: string): string => className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

export const withoutSelectorEscapes = (css: string): string => css.replace(/\\([^a-zA-Z0-9])/g, '$1');

const mentionOf = (className: string): RegExp => new RegExp(`${escapeForRegExp(className)}(?![a-z0-9-])`, 'i');

export function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth -= 1;
    else if (character === ',' && depth === 0) {
      parts.push(selector.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(selector.slice(start));
  return parts;
}

function selectorsMentioning(css: string, className: string): string[] {
  const mentions = mentionOf(className);
  return [...css.matchAll(RULE_BLOCK)]
    .map(([, selector]) => selector.trim().replace(/\s+/g, ' '))
    .filter((selector) => mentions.test(selector));
}

function selectorPartsFor(css: string, className: string): { parts: string[]; unscoped: string[] } {
  const escaped = escapeForRegExp(className);
  const mentions = mentionOf(className);
  const subjectCompound = new RegExp(`(^|[ >+~])[^ >+~]*${escaped}(?![a-z0-9-])[^ >+~]*$`, 'i');
  const actsAsAncestor = new RegExp(`${escaped}(?![a-z0-9-])[^,]*[ >+~]`, 'i');
  const parts = selectorsMentioning(css, className)
    .flatMap((selector) => splitSelectorList(selector).map((part) => part.trim()))
    .filter((part) => mentions.test(part));
  const reaches = (part: string): boolean =>
    (subjectCompound.test(part) && !/[ >+~]/.test(part)) || actsAsAncestor.test(part);
  return { parts, unscoped: parts.filter(reaches) };
}

function countTokens(used: Map<string, number>, value: string): void {
  for (const token of value.split(/\s+/)) {
    if (CLASS_TOKEN_NAME.test(token)) used.set(`.${token}`, (used.get(`.${token}`) ?? 0) + 1);
  }
}

export function classesUsedIn(html: string): Map<string, number> {
  const used = new Map<string, number>();
  for (const [, value] of html.matchAll(CLASS_ATTRIBUTE)) countTokens(used, value.slice(1, -1));
  for (const [, expression] of html.matchAll(NG_CLASS_ATTRIBUTE)) {
    for (const [, single, double] of expression.slice(1, -1).matchAll(QUOTED_LITERAL)) {
      countTokens(used, single ?? double);
    }
  }
  for (const [, name] of html.matchAll(CLASS_BINDING)) used.set(`.${name}`, (used.get(`.${name}`) ?? 0) + 1);
  return used;
}

export function hostClassesIn(source: SourceFile): { used: Map<string, number>; failures: string[] } {
  const used = new Map<string, number>();
  const failures: string[] = [];
  if (source.path.endsWith(COMPILED_SUFFIX)) {
    for (const [, value] of source.text.matchAll(COMPILED_CLASS_ATTRIBUTE)) countTokens(used, value);
    return { used, failures };
  }
  for (const [, body] of source.text.matchAll(HOST_BLOCK)) {
    const literal = HOST_CLASS_LITERAL.exec(body);
    if (literal !== null) countTokens(used, literal[1]);
    else if (HOST_CLASS_KEY.test(body)) {
      failures.push(
        `${source.path}: a host class that is not one single-quoted string literal. ` +
          'Its class names are invisible to this check and to Tailwind alike.',
      );
    }
    for (const [, name] of body.matchAll(HOST_CLASS_BINDING_KEY)) countTokens(used, name);
  }
  return { used, failures };
}

function mergeInto(total: Map<string, number>, counts: Map<string, number>): void {
  for (const [className, count] of counts) total.set(className, (total.get(className) ?? 0) + count);
}

function reachabilityFailures(
  usedClasses: Map<string, number>,
  stylesheets: readonly string[],
  allowedUndeclared: ReadonlySet<string>,
  allowedScoped: ReadonlySet<string>,
): { failures: string[]; allowedScopedSeen: string[] } {
  const failures: string[] = [];
  const allowedScopedSeen: string[] = [];
  for (const [className, usages] of [...usedClasses].sort(([a], [b]) => a.localeCompare(b))) {
    if (allowedUndeclared.has(className)) continue;
    const found = stylesheets.map((css) => selectorPartsFor(css, className));
    if (!found.some(({ parts }) => parts.length > 0)) {
      failures.push(
        `${className}: used ${usages} time(s) and named in no shipped selector. ` +
          'Under Tailwind that is a mistyped utility, which the compiler drops in silence.',
      );
    } else if (found.some(({ unscoped }) => unscoped.length > 0)) {
      continue;
    } else if (allowedScoped.has(className)) {
      allowedScopedSeen.push(`${className} (${usages} usage(s))`);
    } else {
      const selectors = [...new Set(found.flatMap(({ parts }) => parts))].join(', ');
      failures.push(
        `${className}: used ${usages} time(s) and reached only under an ancestor (${selectors}), ` +
          'so every usage outside that ancestor renders unstyled.',
      );
    }
  }
  return { failures, allowedScopedSeen };
}

function offLadderFailures(usedClasses: Map<string, number>, stylesheets: readonly string[]): string[] {
  return [...usedClasses.keys()]
    .filter((className) => Z_INDEX_UTILITY.test(className.slice(1).split(':').pop() ?? className))
    .filter((className) => {
      const mentions = mentionOf(className);
      return !stylesheets.some((css) =>
        [...css.matchAll(RULE_BLOCK)].some(([, selector, body]) => mentions.test(selector) && LADDER_Z_INDEX.test(body)),
      );
    })
    .sort()
    .map((className) => `${className}: a z-index utility that does not read a --z-* token from @theme.`);
}

function plainTokens(classList: string): string[] {
  return classList.split(/\s+/).filter((token) => CLASS_TOKEN_NAME.test(token) && !token.includes(VARIANT_SEPARATOR));
}

function directiveHostTokens(hostSources: readonly SourceFile[]): Map<string, string[]> {
  const byAttribute = new Map<string, string[]>();
  for (const source of hostSources) {
    for (const [, , selector, body] of source.text.matchAll(DIRECTIVE_DECLARATION)) {
      const literal = HOST_CLASS_LITERAL.exec(body)?.[1] ?? COMPILED_CLASS_ATTRIBUTE_ONCE.exec(body)?.[1];
      if (literal === undefined) continue;
      for (const [, attribute] of selector.matchAll(SELECTOR_ATTRIBUTE)) byAttribute.set(attribute, plainTokens(literal));
    }
  }
  return byAttribute;
}

function propertiesSetBy(stylesheets: readonly string[], cache: Map<string, Set<string>>, token: string): Set<string> {
  const cached = cache.get(token);
  if (cached !== undefined) return cached;
  const exactSelector = `.${token}`;
  const properties = new Set<string>();
  for (const css of stylesheets) {
    for (const [, selector, body] of css.matchAll(RULE_BLOCK)) {
      if (!splitSelectorList(selector).some((part) => part.trim() === exactSelector)) continue;
      for (const [, property] of body.matchAll(DECLARED_PROPERTY)) if (!property.startsWith('--')) properties.add(property);
    }
  }
  cache.set(token, properties);
  return properties;
}

function directiveConflicts(templates: readonly SourceFile[], hostSources: readonly SourceFile[], stylesheets: readonly string[]): string[] {
  const hostTokens = directiveHostTokens(hostSources);
  const cache = new Map<string, Set<string>>();
  const failures: string[] = [];
  for (const template of templates) {
    for (const tag of template.text.matchAll(OPENING_TAG)) {
      const attributes = tag[1];
      const classMatch = STATIC_CLASS_ATTRIBUTE.exec(attributes);
      const classList = classMatch?.[1] ?? classMatch?.[2];
      if (classList === undefined) continue;
      const directives = [...hostTokens.keys()].filter((attribute) =>
        new RegExp(`(?:^|[\\s\\[])${escapeForRegExp(attribute)}(?![\\w-])`).test(attributes),
      );
      if (directives.length === 0) continue;
      const line = template.text.slice(0, tag.index ?? 0).split('\n').length;
      for (const directive of directives) {
        const owned = new Set((hostTokens.get(directive) ?? []).flatMap((token) => [...propertiesSetBy(stylesheets, cache, token)]));
        for (const token of plainTokens(classList)) {
          const clash = [...propertiesSetBy(stylesheets, cache, token)].filter((property) => owned.has(property));
          if (clash.length > 0) {
            failures.push(
              `${template.path}:${line}: ${token} sets ${clash.join(', ')}, which ${directive} already sets; ` +
                'the winner would be decided by stylesheet order. Use a variant, another directive, or no utility.',
            );
          }
        }
      }
    }
  }
  return failures;
}

export function analyzeUtilities(options: UtilitiesOptions): UtilitiesResult {
  const stylesheets = options.stylesheets.map(({ text }) => withoutSelectorEscapes(withoutComments(text)));
  const usedClasses = new Map<string, number>();
  const failures: string[] = [];
  for (const template of options.templates) {
    if (UNANALYZABLE_CLASS_BINDING.test(template.text)) {
      failures.push(
        `${template.path}: un-analyzable class binding; use [class.x] or a static class attribute. ` +
          'A whole-attribute [class] expression hides its class names from this check.',
      );
    }
    mergeInto(usedClasses, classesUsedIn(template.text));
  }
  for (const source of options.hostSources) {
    const host = hostClassesIn(source);
    failures.push(...host.failures);
    mergeInto(usedClasses, host.used);
  }
  const reachability = reachabilityFailures(
    usedClasses,
    stylesheets,
    options.allowedUndeclared ?? new Set(),
    options.allowedScoped ?? new Set(),
  );
  return {
    failures: [
      ...failures,
      ...reachability.failures,
      ...offLadderFailures(usedClasses, stylesheets),
      ...directiveConflicts(options.templates, options.hostSources, stylesheets),
    ],
    allowedScopedSeen: reachability.allowedScopedSeen,
    templateClassCount: usedClasses.size,
  };
}

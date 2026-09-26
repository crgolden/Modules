import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUILT_DIRECTORY,
  SOURCE_DIRECTORY,
  THEME_STYLESHEET,
  LITERAL_COLOR,
  analyzeUtilities,
  checkDesignUtilities,
  unconsumedThemeTokens,
} from './index';
import type { SourceFile, UtilitiesResult } from './index';
import { newCount, newMemberOf, newText } from '../testing';
import { CSS_NAMED_COLORS } from './css-named-color-constants';

const builtStylesheet = (css: string): SourceFile => ({ path: `dist/${newText()}.css`, text: css });
const template = (html: string): SourceFile => ({ path: `src/${newText()}.html`, text: html });
const hostSource = (code: string): SourceFile => ({ path: `src/${newText()}.ts`, text: code });

function analyze(stylesheets: SourceFile[], templates: SourceFile[], hostSources: SourceFile[]): UtilitiesResult {
  return analyzeUtilities({ stylesheets, templates, hostSources });
}

function everyColorPattern(): RegExp[] {
  return LITERAL_COLOR.map((pattern) => new RegExp(pattern.slice(1, -1)));
}

function aShippedUtilityPassesAndAMistypedOneFails(): void {
  const shipped = newText();
  const mistyped = newText();

  const result = analyze(
    [builtStylesheet(`.${shipped}{gap:1rem}`)],
    [template(`<div class="${shipped} ${mistyped}"></div>`)],
    [],
  );

  assert.deepEqual(result.failures.map((failure) => failure.split(':')[0]), [`.${mistyped}`]);
}

function aHostClassLiteralIsReadLikeATemplateClass(): void {
  const shipped = newText();
  const missing = newText();

  const result = analyze(
    [builtStylesheet(`.${shipped}{gap:1rem}`)],
    [],
    [hostSource(`@Directive({ selector: '[crgCard]', host: { class: '${shipped} ${missing}' } })`)],
  );

  assert.deepEqual(result.failures.map((failure) => failure.split(':')[0]), [`.${missing}`]);
}

function aHostClassThatIsNotALiteralFails(): void {
  const source = hostSource(`@Directive({ selector: '[crgCard]', host: { class: ${newText()} } })`);

  const result = analyze([], [], [source]);

  assert.deepEqual(result.failures.map((failure) => failure.split(':')[0]), [source.path]);
}

function aHostClassBindingKeyCarryingAVariantIsRead(): void {
  const utility = `hover:${newText()}`;

  const reached = analyze(
    [builtStylesheet(`.${utility.replace(':', '\\:')}:hover{color:red}`)],
    [],
    [hostSource(`@Directive({ host: { '[class.${utility}]': 'active' } })`)],
  );
  const unreached = analyze([], [], [hostSource(`@Directive({ host: { '[class.${utility}]': 'active' } })`)]);

  assert.deepEqual(reached.failures, []);
  assert.deepEqual(unreached.failures.map((failure) => failure.split(': ')[0]), [`.${utility}`]);
}

function aCompiledHostClassAttributeIsRead(): void {
  const shipped = newText();
  const missing = newText();

  const compiled: SourceFile = {
    path: `node_modules/@crgolden/modules/dist/primitives/${newText()}.js`,
    text:
      `static ɵdir = i0.ɵɵngDeclareDirective({ host: { classAttribute: "${shipped} ${missing}" }, ngImport: i0 });\n` +
      `i0.ɵɵngDeclareClassMetadata({ decorators: [{ type: Directive, args: [{ host: { class: '${shipped} ${missing}' } }] }] });`,
  };

  const result = analyze([builtStylesheet(`.${shipped}{gap:1rem}`)], [], [compiled]);

  assert.equal(result.failures.length, 1);
  assert.ok(result.failures[0].startsWith(`.${missing}: used 1 time(s)`), result.failures[0]);
}

interface DirectiveFixture {
  readonly attribute: string;
  readonly hostUtility: string;
  readonly rival: string;
  readonly unrelated: string;
  readonly stylesheet: SourceFile;
  readonly directive: SourceFile;
}

function directiveFixture(): DirectiveFixture {
  const attribute = `crg${newText()}`;
  const hostUtility = newText();
  const rival = newText();
  const unrelated = newText();
  return {
    attribute,
    hostUtility,
    rival,
    unrelated,
    stylesheet: builtStylesheet(
      `.${hostUtility}{background-color:var(--color-${newText()})}` +
        `.${rival}{background-color:var(--color-${newText()})}` +
        `.hover\\:${rival}:hover{background-color:var(--color-${newText()})}` +
        `.${unrelated}{gap:1rem}`,
    ),
    directive: hostSource(`@Directive({ selector: 'button[${attribute}]', host: { class: '${hostUtility}' } })`),
  };
}

function aPlainUtilityRivallingADirectivePropertyFails(): void {
  const fixture = directiveFixture();
  const page = template(`<button ${fixture.attribute} class="${fixture.rival}"></button>`);

  const result = analyze([fixture.stylesheet], [page], [fixture.directive]);

  assert.equal(result.failures.length, 1);
  assert.ok(result.failures[0].startsWith(`${page.path}:1: ${fixture.rival} sets background-color`), result.failures[0]);
}

function aVariantOrAnUnrelatedUtilityBesideADirectivePasses(): void {
  const fixture = directiveFixture();
  const page = template(`<button ${fixture.attribute} class="hover:${fixture.rival} ${fixture.unrelated}"></button>`);

  const result = analyze([fixture.stylesheet], [page], [fixture.directive]);

  assert.deepEqual(result.failures, []);
}

function aZIndexUtilityMustReadALadderToken(): void {
  const rung = newText();
  const literalLayer = `z-${newCount()}`;

  const onLadder = analyze(
    [builtStylesheet(`.z-\\(--z-${rung}\\){z-index:var(--z-${rung})}`)],
    [template(`<header class="z-(--z-${rung})"></header>`)],
    [],
  );
  const offLadder = analyze(
    [builtStylesheet(`.${literalLayer}{z-index:${newCount()}}`)],
    [template(`<header class="${literalLayer}"></header>`)],
    [],
  );

  assert.deepEqual(onLadder.failures, []);
  assert.deepEqual(offLadder.failures.map((failure) => failure.split(':')[0]), [`.${literalLayer}`]);
}

function aThemeTokenNothingReadsIsReported(): void {
  const consumed = `--color-${newText()}`;
  const unconsumed = `--color-${newText()}`;
  const breakpoint = `--breakpoint-${newText()}`;

  const found = unconsumedThemeTokens({
    themeCss: `@theme {\n  ${consumed}: oklch(0.5 0 0);\n  ${unconsumed}: oklch(0.6 0 0);\n  ${breakpoint}: 30rem;\n}`,
    stylesheets: [`.${newText()}{color:var(${consumed})}`],
  });

  assert.deepEqual(found, [unconsumed]);
}

function aShadowTokenIsReadThroughTheUtilityTailwindInlinesItInto(): void {
  const plain = `--shadow-${newText()}`;
  const mergedWithPlain = `--shadow-${newText()}`;
  const onHover = `--shadow-${newText()}`;
  const readThroughVar = `--shadow-${newText()}`;
  const unused = `--shadow-${newText()}`;
  const inlined = `{--tw-shadow: 0 ${newCount()}px ${newCount()}px var(--tw-shadow-color, oklch(0 0 0 / .1))}`;
  const utility = (token: string): string => token.slice('--'.length);

  const found = unconsumedThemeTokens({
    themeCss: `@theme {\n  ${plain}: 0 1px 2px black;\n  ${mergedWithPlain}: 0 1px 2px black;\n  ${onHover}: 0 4px 8px black;\n  ${readThroughVar}: 0 0 0 3px black;\n  ${unused}: 0 8px 16px black;\n}`,
    stylesheets: [
      `.${utility(plain)},.${utility(mergedWithPlain)}${inlined}.hover\\:${utility(onHover)}:hover${inlined}`,
      `input:focus{box-shadow:var(${readThroughVar})}`,
    ],
  });

  assert.deepEqual(found, [unused]);
}

function aLiteralColorIsBannedUnlessItReadsAToken(): void {
  const patterns = everyColorPattern();
  const literal = `oklch(0.${newCount()} 0 0)`;
  const mixedFromToken = `color-mix(in oklab, var(--color-${newText()}) 8%, transparent)`;

  assert.ok(patterns.some((pattern) => pattern.test(literal)), `${literal} passed the color ban`);
  assert.ok(!patterns.some((pattern) => pattern.test(mixedFromToken)), `${mixedFromToken} failed the color ban`);
}

function aNamedColorIsBannedButTransparentAndATokenNamingOneAreNot(): void {
  const patterns = everyColorPattern();
  const namedColor = newMemberOf(CSS_NAMED_COLORS);
  const bordered = `${newCount()}px solid ${namedColor}`;
  const transparentOutline = `${newCount()}px solid transparent`;
  const tokenNamingAColor = `var(--color-${namedColor})`;

  assert.ok(patterns.some((pattern) => pattern.test(namedColor)), `${namedColor} passed the color ban`);
  assert.ok(patterns.some((pattern) => pattern.test(bordered)), `${bordered} passed the color ban`);
  assert.ok(!patterns.some((pattern) => pattern.test(transparentOutline)), `${transparentOutline} failed the color ban`);
  assert.ok(!patterns.some((pattern) => pattern.test(tokenNamingAColor)), `${tokenNamingAColor} failed the color ban`);
}

type BuiltCss = (utility: string, token: string) => string;

function appWithSources(builtCss: BuiltCss | null): string {
  const repoRoot = mkdtempSync(join(tmpdir(), `${newText()}-`));
  const token = `--color-${newText()}`;
  const utility = newText();
  mkdirSync(join(repoRoot, SOURCE_DIRECTORY));
  writeFileSync(join(repoRoot, SOURCE_DIRECTORY, THEME_STYLESHEET), `@theme {\n  ${token}: oklch(0.5 0 0);\n}\n`);
  writeFileSync(join(repoRoot, SOURCE_DIRECTORY, `${newText()}.html`), `<div class="${utility}"></div>`);
  if (builtCss !== null) {
    mkdirSync(join(repoRoot, BUILT_DIRECTORY));
    writeFileSync(join(repoRoot, BUILT_DIRECTORY, `${newText()}.css`), builtCss(utility, token));
  }
  return repoRoot;
}

function aBuiltAppWhoseClassesAndTokensShipPasses(): void {
  const repoRoot = appWithSources((utility, token) => `.${utility}{color:var(${token})}`);

  const check = checkDesignUtilities({ repoRoot });

  rmSync(repoRoot, { recursive: true, force: true });
  assert.ok(check.passed, String(check.report));
}

function anAppWithNoBuildFailsRatherThanPassingVacuously(): void {
  const repoRoot = appWithSources(null);

  const check = checkDesignUtilities({ repoRoot });

  rmSync(repoRoot, { recursive: true, force: true });
  assert.equal(check.passed, false);
}

function aBuildThatShipsNoStylesheetFails(): void {
  const repoRoot = appWithSources(null);
  mkdirSync(join(repoRoot, BUILT_DIRECTORY));

  const check = checkDesignUtilities({ repoRoot });

  rmSync(repoRoot, { recursive: true, force: true });
  assert.equal(check.passed, false);
}

aShippedUtilityPassesAndAMistypedOneFails();
aBuiltAppWhoseClassesAndTokensShipPasses();
anAppWithNoBuildFailsRatherThanPassingVacuously();
aBuildThatShipsNoStylesheetFails();
aHostClassLiteralIsReadLikeATemplateClass();
aHostClassThatIsNotALiteralFails();
aHostClassBindingKeyCarryingAVariantIsRead();
aCompiledHostClassAttributeIsRead();
aPlainUtilityRivallingADirectivePropertyFails();
aVariantOrAnUnrelatedUtilityBesideADirectivePasses();
aZIndexUtilityMustReadALadderToken();
aThemeTokenNothingReadsIsReported();
aShadowTokenIsReadThroughTheUtilityTailwindInlinesItInto();
aLiteralColorIsBannedUnlessItReadsAToken();
aNamedColorIsBannedButTransparentAndATokenNamingOneAreNot();
console.log('design-gates: every template and host class reaches shipped CSS, and every token is read');

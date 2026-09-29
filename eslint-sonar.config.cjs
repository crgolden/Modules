const tseslint = require('typescript-eslint');

const interop = (module) => module.default ?? module;
const sonarjs = interop(require('eslint-plugin-sonarjs'));
const unicorn = interop(require('eslint-plugin-unicorn'));
const importX = interop(require('eslint-plugin-import-x'));
const { blocks } = require('./eslint-sonar.rules.json');

const javascriptPlugins = { sonarjs, unicorn, 'import-x': importX, '@typescript-eslint': tseslint.plugin };
const typescriptPlugins = { ...javascriptPlugins };
const typescriptParserOptions = { project: ["./tsconfig.test.json", "./tsconfig.primitives.json"], tsconfigRootDir: __dirname };

module.exports = blocks.map((block) => ({
  files: block.files,
  ignores: block.ignores,
  languageOptions: block.javascript
    ? { parser: tseslint.parser }
    : { parser: tseslint.parser, parserOptions: typescriptParserOptions },
  plugins: block.javascript ? javascriptPlugins : typescriptPlugins,
  rules: block.rules,
}));

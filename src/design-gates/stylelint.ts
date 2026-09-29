import { CSS_NAMED_COLORS } from './css-named-color-constants';

const COLOR_PROPERTIES = [
  'color',
  'background',
  'background-color',
  'border',
  'border-color',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline',
  'outline-color',
  'fill',
  'stroke',
  'accent-color',
  'caret-color',
  'box-shadow',
  'text-shadow',
  'text-decoration-color',
] as const;

export const LITERAL_COLOR = [
  String.raw`/#[0-9a-fA-F]{3,8}\b/`,
  String.raw`/^(?!.*var\().*\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/`,
  String.raw`/(?<![\w-])(?:${CSS_NAMED_COLORS.join('|')})(?![\w-])/`,
];

const TOKEN_ONLY_VALUES: Readonly<Record<string, readonly string[]>> = {
  'font-size': [String.raw`/^var\(--text-/`, 'inherit'],
  'font-weight': [String.raw`/^var\(--font-weight-/`, 'inherit'],
  'letter-spacing': [String.raw`/^var\(--tracking-/`, 'normal', 'inherit'],
  'font-family': [String.raw`/^var\(--font-/`, 'inherit'],
  'line-height': [String.raw`/^var\(--leading-/`, String.raw`/^\d+(?:\.\d+)?$/`, 'inherit'],
  'box-shadow': [String.raw`/^var\(--shadow-/`, 'none'],
  'z-index': [String.raw`/^var\(--z-/`, 'auto', '0'],
};

export const designStylelintConfig = {
  rules: {
    'declaration-property-value-disallowed-list': [
      Object.fromEntries(COLOR_PROPERTIES.map((property) => [property, LITERAL_COLOR])),
      {
        message: (property: string) =>
          `"${property}" uses a literal color. Use a var(--color-*) token from @theme, inherit or currentColor.`,
      },
    ],
    'declaration-property-value-allowed-list': [
      TOKEN_ONLY_VALUES,
      {
        message: (property: string) =>
          `"${property}" must read a Tailwind @theme token (--text-*, --font-weight-*, --tracking-*, --font-*, ` +
          '--leading-*, --shadow-*, --z-*), not a literal.',
      },
    ],
  },
};

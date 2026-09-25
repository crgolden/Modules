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
  '/#[0-9a-fA-F]{3,8}\\b/',
  '/^(?!.*var\\().*\\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\\(/',
  `/(?<![\\w-])(?:${CSS_NAMED_COLORS.join('|')})(?![\\w-])/`,
];

const TOKEN_ONLY_VALUES: Readonly<Record<string, readonly string[]>> = {
  'font-size': ['/^var\\(--text-/', 'inherit'],
  'font-weight': ['/^var\\(--font-weight-/', 'inherit'],
  'letter-spacing': ['/^var\\(--tracking-/', 'normal', 'inherit'],
  'font-family': ['/^var\\(--font-/', 'inherit'],
  'line-height': ['/^var\\(--leading-/', '/^\\d+(?:\\.\\d+)?$/', 'inherit'],
  'box-shadow': ['/^var\\(--shadow-/', 'none'],
  'z-index': ['/^var\\(--z-/', 'auto', '0'],
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

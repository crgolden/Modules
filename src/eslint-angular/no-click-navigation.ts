import type { Rule } from 'eslint';

export const SUGGESTED_NAVIGATION_METHODS: readonly string[] = [
  'goToPage',
  'setView',
  'setPage',
  'changePage',
  'changePageSize',
  'changeSort',
  'navigateTo',
  'goTo',
];

const LINK_ATTRIBUTES: readonly string[] = ['href', 'routerLink'];
const PLACEHOLDER_HREFS: readonly string[] = ['', '#', 'javascript:void(0)', 'javascript:;'];
const ANCHOR_ELEMENTS: readonly string[] = ['a', 'area'];

interface TemplateAttribute {
  name: string;
  value?: unknown;
}

interface TemplateOutput {
  name: string;
  sourceSpan?: { start: { offset: number }; end: { offset: number } };
}

interface TemplateElement {
  name: string;
  attributes: TemplateAttribute[];
  inputs: TemplateAttribute[];
  outputs: TemplateOutput[];
  sourceSpan: unknown;
}

interface TemplateLoc {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

const HANDLER_NAME_PATTERN =
  /=\s*"\s*(?:\$event\.preventDefault\(\)\s*;\s*)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/;

export function handlerNameOf(bindingText: string): string | null {
  const match = HANDLER_NAME_PATTERN.exec(bindingText);
  if (match === null) {
    return null;
  }
  const path = match[1].split('.');
  return path[path.length - 1];
}

function attributeNamed(element: TemplateElement, name: string): TemplateAttribute | undefined {
  return [...element.attributes, ...element.inputs].find(a => a.name === name);
}

function hasLinkTarget(element: TemplateElement): boolean {
  return LINK_ATTRIBUTES.some(name => attributeNamed(element, name) !== undefined);
}

function isPlaceholderHref(element: TemplateElement): boolean {
  const href = element.attributes.find(a => a.name === 'href');
  if (href === undefined || typeof href.value !== 'string') {
    return false;
  }
  return PLACEHOLDER_HREFS.includes(href.value.trim());
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Angular: user-initiated navigation must be a routerLink or a real href, never a (click) handler (crgolden rule 15).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          navigationMethods: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      anchorWithoutHref:
        'This <{{element}}> has a (click) handler but no href or routerLink, so it is not a real link: it cannot be hovered, bookmarked, opened in a new tab, or crawled. Give it routerLink (in-app) or href (outside the router), or use a <button> if it is not navigation. crgolden rule 15.',
      placeholderHref:
        'This <{{element}}> uses a placeholder href and navigates from its (click) handler instead. Bind the real destination with routerLink so the browser owns the navigation. crgolden rule 15.',
      clickNavigation:
        '"{{handler}}" changes the URL from a (click) handler on <{{element}}>. Navigation must be a link: render an <a [routerLink]> so hover, bookmark, Ctrl-click and crawlers all work. crgolden rule 15.',
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as { navigationMethods?: string[] };
    const navigationMethods = new Set(options.navigationMethods ?? []);
    const parserServices = context.sourceCode.parserServices as
      | { convertNodeSourceSpanToLoc?: (span: unknown) => TemplateLoc }
      | undefined;
    const templateText = context.sourceCode.getText();

    function locOf(element: TemplateElement): TemplateLoc | undefined {
      return parserServices?.convertNodeSourceSpanToLoc?.(element.sourceSpan);
    }

    return {
      Element(node: unknown) {
        const element = node as TemplateElement;
        const clickOutput = element.outputs.find(o => o.name === 'click');
        if (clickOutput === undefined) {
          return;
        }

        const loc = locOf(element);
        if (loc === undefined) {
          return;
        }

        const isAnchor = ANCHOR_ELEMENTS.includes(element.name.toLowerCase());

        if (isAnchor && isPlaceholderHref(element)) {
          context.report({ loc, messageId: 'placeholderHref', data: { element: element.name } });
          return;
        }

        if (isAnchor && !hasLinkTarget(element)) {
          context.report({ loc, messageId: 'anchorWithoutHref', data: { element: element.name } });
          return;
        }

        if (hasLinkTarget(element)) {
          return;
        }

        const span = clickOutput.sourceSpan;
        if (span === undefined) {
          return;
        }
        const handler = handlerNameOf(templateText.slice(span.start.offset, span.end.offset));
        if (handler !== null && navigationMethods.has(handler)) {
          context.report({
            loc,
            messageId: 'clickNavigation',
            data: { handler, element: element.name },
          });
        }
      },
    };
  },
};

export default rule;

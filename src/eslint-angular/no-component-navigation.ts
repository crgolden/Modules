import type { Rule } from 'eslint';
import type { Node } from 'estree';

export const REDIRECT_CALLBACKS: readonly string[] = ['subscribe', 'then', 'catch', 'finally'];

const NAVIGATION_CALLS: readonly string[] = ['navigate', 'navigateByUrl'];
const LOCATION_OBJECTS: readonly string[] = ['location', 'window', 'globalThis', 'document'];

type WalkableNode = Node & { parent?: WalkableNode | null };

function* ancestorsOf(node: WalkableNode): Generator<WalkableNode> {
  for (let current = node.parent; current !== null && current !== undefined; current = current.parent) {
    yield current;
  }
}

function isComponentDecorated(node: WalkableNode): boolean {
  const decorators = (node as unknown as { decorators?: { expression?: unknown }[] }).decorators;
  if (decorators === undefined) {
    return false;
  }
  return decorators.some(d => {
    const expression = d.expression as { callee?: { name?: string }; name?: string } | undefined;
    return expression?.callee?.name === 'Component' || expression?.name === 'Component';
  });
}

function enclosingComponent(node: WalkableNode): boolean {
  for (const current of ancestorsOf(node)) {
    if (current.type === 'ClassDeclaration' || current.type === 'ClassExpression') {
      return isComponentDecorated(current);
    }
  }
  return false;
}

function enclosingCallbackNames(node: WalkableNode): string[] {
  const names: string[] = [];
  for (const current of ancestorsOf(node)) {
    if (current.type !== 'CallExpression') {
      continue;
    }
    const callee = current.callee as { type?: string; property?: { name?: string } };
    if (callee.type === 'MemberExpression' && typeof callee.property?.name === 'string') {
      names.push(callee.property.name);
    }
  }
  return names;
}

function enclosingMethodName(node: WalkableNode): string | null {
  for (const current of ancestorsOf(node)) {
    if (current.type === 'MethodDefinition' || current.type === 'PropertyDefinition') {
      const key = (current as unknown as { key?: { name?: string } }).key;
      return key?.name ?? null;
    }
  }
  return null;
}

function isRouterNavigation(node: { callee?: unknown }): boolean {
  const callee = node.callee as
    | { type?: string; property?: { name?: string }; object?: { property?: { name?: string }; name?: string } }
    | undefined;
  if (callee?.type !== 'MemberExpression' || typeof callee.property?.name !== 'string') {
    return false;
  }
  if (!NAVIGATION_CALLS.includes(callee.property.name)) {
    return false;
  }
  const objectName = callee.object?.property?.name ?? callee.object?.name;
  return typeof objectName === 'string' && objectName.toLowerCase().includes('router');
}

function isLocationAssignment(node: { left?: unknown }): boolean {
  const left = node.left as
    | { type?: string; property?: { name?: string }; object?: { type?: string; property?: { name?: string }; name?: string } }
    | undefined;
  if (left?.type !== 'MemberExpression') {
    return false;
  }
  if (left.property?.name !== 'href' && left.property?.name !== 'pathname') {
    return false;
  }
  const object = left.object;
  if (object?.property?.name === 'location') {
    return true;
  }
  return typeof object?.name === 'string' && LOCATION_OBJECTS.includes(object.name);
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Angular: a @Component must not navigate from a method body; user-initiated navigation is a link (crgolden rule 15).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          exemptMethods: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
          redirectCallbacks: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      componentNavigation:
        '"{{method}}" navigates from a @Component method body. If a user clicks something to get here, it must be an <a [routerLink]> instead so hover, bookmark, Ctrl-click and crawlers work. If this is a redirect with no clickable element (a form submit, a post-save redirect), name it in this rule\'s exemptMethods so the exception is declared rather than assumed. crgolden rule 15.',
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as {
      exemptMethods?: string[];
      redirectCallbacks?: string[];
    };
    const exemptMethods = new Set(options.exemptMethods ?? []);
    const redirectCallbacks = new Set(options.redirectCallbacks ?? REDIRECT_CALLBACKS);

    function check(node: WalkableNode): void {
      if (!enclosingComponent(node)) {
        return;
      }
      if (enclosingCallbackNames(node).some(name => redirectCallbacks.has(name))) {
        return;
      }
      const method = enclosingMethodName(node);
      if (method === null || exemptMethods.has(method)) {
        return;
      }
      context.report({ node: node as Node, messageId: 'componentNavigation', data: { method } });
    }

    return {
      CallExpression(node) {
        if (isRouterNavigation(node)) {
          check(node as WalkableNode);
        }
      },
      AssignmentExpression(node) {
        if (isLocationAssignment(node)) {
          check(node as WalkableNode);
        }
      },
    };
  },
};

export default rule;

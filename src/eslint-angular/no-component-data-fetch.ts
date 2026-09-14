import type { Rule } from 'eslint';
import type { Node } from 'estree';

type AnyNode = Node & { parent?: AnyNode | null; [key: string]: unknown };

const FETCH_TERMINATORS = ['subscribe'];
const FETCH_FUNCTIONS = ['firstValueFrom', 'lastValueFrom', 'toSignal'];
const INIT_METHODS = ['ngOnInit', 'constructor'];

const CLOSURE_TYPES = ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'];

function isComponentClass(node: AnyNode): boolean {
  const decorators = node.decorators as { expression?: { callee?: { name?: string } } }[] | undefined;
  return (decorators ?? []).some(d => d.expression?.callee?.name === 'Component');
}

function isSubscribeCall(node: AnyNode): boolean {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const callee = node.callee as AnyNode | undefined;
  return callee?.type === 'MemberExpression'
    && (callee.property as unknown as { name?: string })?.name === 'subscribe';
}

function subscriptionEmitsAtInit(node: AnyNode): boolean {
  return isSubscribeCall(node)
    && (chainProducesRequest(node.callee as AnyNode | undefined) || routeStreamSubscribe(node));
}

function walkInitPath(node: AnyNode | null | undefined, visit: (n: AnyNode) => void): void {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visit(node);
  const descendIntoHandler = subscriptionEmitsAtInit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') {
      continue;
    }
    const value = node[key];
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      const candidate = child as AnyNode | null;
      if (!candidate || typeof candidate.type !== 'string') {
        continue;
      }
      const isClosure = CLOSURE_TYPES.includes(candidate.type);
      if (isClosure && !(descendIntoHandler && key === 'arguments')) {
        continue;
      }
      walkInitPath(candidate, visit);
    }
  }
}

const OPERATOR_CALLS = ['pipe', 'subscribe'];

function chainProducesRequest(callee: AnyNode | undefined): boolean {
  let current: AnyNode | undefined = callee;
  while (current) {
    if (current.type === 'CallExpression') {
      const inner = current.callee as AnyNode | undefined;
      const property = inner?.type === 'MemberExpression'
        ? (inner.property as unknown as { name?: string })?.name
        : undefined;
      if (!property || !OPERATOR_CALLS.includes(property)) {
        return true;
      }
      current = (inner as AnyNode).object as AnyNode;
      continue;
    }
    if (current.type === 'MemberExpression') {
      current = current.object as AnyNode;
      continue;
    }
    return false;
  }
  return false;
}

function calleeName(node: AnyNode): string | null {
  const callee = node.callee as AnyNode | undefined;
  if (!callee) {
    return null;
  }
  if (callee.type === 'Identifier') {
    return (callee as unknown as { name: string }).name;
  }
  if (callee.type === 'MemberExpression') {
    const property = callee.property as unknown as { name?: string };
    return property?.name ?? null;
  }
  return null;
}

function isEagerFetch(node: AnyNode): boolean {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const name = calleeName(node);
  if (name && FETCH_FUNCTIONS.includes(name)) {
    return chainProducesRequest(((node.arguments as AnyNode[]) ?? [])[0]);
  }
  if (name && FETCH_TERMINATORS.includes(name)) {
    return chainProducesRequest(node.callee as AnyNode);
  }
  return false;
}

function isPipelineKick(node: AnyNode): boolean {
  if (node.type !== 'CallExpression' || calleeName(node) !== 'next') {
    return false;
  }
  const callee = node.callee as AnyNode;
  const object = callee.object as AnyNode | undefined;
  return object?.type === 'MemberExpression'
    && (object.object as AnyNode | undefined)?.type === 'ThisExpression';
}

const ROUTE_STREAMS = ['queryParams', 'params', 'paramMap', 'queryParamMap', 'data', 'fragment'];

function walkIncludingClosures(node: AnyNode | null | undefined, visit: (n: AnyNode) => void): void {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') {
      continue;
    }
    const value = node[key];
    for (const child of (Array.isArray(value) ? value : [value])) {
      const candidate = child as AnyNode | null;
      if (candidate && typeof candidate.type === 'string') {
        walkIncludingClosures(candidate, visit);
      }
    }
  }
}

function routeStreamSubscribe(node: AnyNode): boolean {
  if (node.type !== 'CallExpression' || calleeName(node) !== 'subscribe') {
    return false;
  }
  let current = (node.callee as AnyNode).object as AnyNode | undefined;
  while (current) {
    if (current.type === 'CallExpression') {
      current = ((current.callee as AnyNode)?.object) as AnyNode | undefined;
      continue;
    }
    if (current.type === 'MemberExpression') {
      const property = (current.property as unknown as { name?: string })?.name;
      const object = current.object as AnyNode | undefined;
      if (property && ROUTE_STREAMS.includes(property)
        && object?.type === 'MemberExpression'
        && ((object.property as unknown as { name?: string })?.name === 'route')) {
        return true;
      }
      current = object;
      continue;
    }
    return false;
  }
  return false;
}

function selfCallNames(body: AnyNode): string[] {
  const names: string[] = [];
  walkInitPath(body, node => {
    if (node.type !== 'CallExpression') {
      return;
    }
    const callee = node.callee as AnyNode | undefined;
    if (callee?.type === 'MemberExpression'
      && (callee.object as AnyNode | undefined)?.type === 'ThisExpression') {
      const property = callee.property as unknown as { name?: string };
      if (property?.name) {
        names.push(property.name);
      }
    }
  });
  return names;
}

function bodyFetches(body: AnyNode | null | undefined): boolean {
  let found = false;
  walkInitPath(body, node => {
    if (isEagerFetch(node)) {
      found = true;
    }
  });
  return found;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Angular: a component must not fetch the data it needs to render; a route resolver supplies it (crgolden rule 16).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          exemptMethods: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      initFetch:
        'This @Component fetches its own data on the init path ({{where}}). Data a component needs in order to render comes from a route resolver, so the route does not activate until it is in hand: no "Loading..." placeholder, a deep link that works, and browser-Back scroll restoration against a full-height page. Move the request into a resolver and read it from route.snapshot.data. crgolden rule 16.',
      initKick:
        'This @Component kicks a request pipeline on the init path ({{where}}), which is an eager load by another name. The first payload comes from a route resolver; the pipeline stays for user-driven reloads. crgolden rule 16.',
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as { exemptMethods?: string[] };
    const exemptMethods = new Set(options.exemptMethods ?? []);

    function classMethodBody(classBody: AnyNode, name: string): AnyNode | null {
      const members = (classBody.body ?? []) as AnyNode[];
      for (const member of members) {
        if (member.type !== 'MethodDefinition') {
          continue;
        }
        const key = member.key as unknown as { name?: string };
        if (key?.name === name || (name === 'constructor' && member.kind === 'constructor')) {
          return (member.value as AnyNode)?.body as AnyNode;
        }
      }
      return null;
    }

    function report(node: AnyNode, where: string, messageId: 'initFetch' | 'initKick'): void {
      context.report({ node: node as Node, messageId, data: { where } });
    }

    return {
      ClassDeclaration(node) {
        const cls = node as unknown as AnyNode;
        if (!isComponentClass(cls)) {
          return;
        }
        const classBody = cls.body as AnyNode;
        const members = (classBody.body ?? []) as AnyNode[];

        const checked: { where: string; body: AnyNode | null }[] = [];
        for (const name of INIT_METHODS) {
          checked.push({ where: name, body: classMethodBody(classBody, name) });
        }
        for (const member of members) {
          if (member.type === 'PropertyDefinition' && member.value) {
            checked.push({ where: 'a field initialiser', body: member.value as AnyNode });
          }
        }

        for (const { where, body } of checked) {
          if (!body) {
            continue;
          }
          walkInitPath(body, inner => {
            if (isEagerFetch(inner)) {
              report(inner, where, 'initFetch');
            } else if (isPipelineKick(inner)) {
              report(inner, where, 'initKick');
            } else if (routeStreamSubscribe(inner)) {
              let handlerLoads = false;
              for (const arg of (inner.arguments as AnyNode[]) ?? []) {
                walkIncludingClosures(arg, deep => {
                  if (isEagerFetch(deep) || isPipelineKick(deep)) {
                    handlerLoads = true;
                    return;
                  }
                  if (deep.type === 'CallExpression') {
                    const cal = deep.callee as AnyNode | undefined;
                    if (cal?.type === 'MemberExpression'
                      && (cal.object as AnyNode | undefined)?.type === 'ThisExpression') {
                      const named = (cal.property as unknown as { name?: string })?.name;
                      const target = named ? classMethodBody(classBody, named) : null;
                      if (target && bodyFetches(target)) {
                        handlerLoads = true;
                      }
                    }
                  }
                });
              }
              if (handlerLoads) {
                report(inner, `${where} -> an ActivatedRoute stream`, 'initFetch');
              }
            }
          });

          for (const name of selfCallNames(body)) {
            if (exemptMethods.has(name)) {
              continue;
            }
            const target = classMethodBody(classBody, name);
            if (target && bodyFetches(target)) {
              report(body, `${where} -> ${name}()`, 'initFetch');
            }
          }
        }
      },
    };
  },
};

export default rule;

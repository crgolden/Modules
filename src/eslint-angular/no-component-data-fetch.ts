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

/**
 * Walk the init path: skip nested functions, EXCEPT the handler passed to `.subscribe(...)`.
 *
 * A `pipe(switchMap(...))` operator runs when the subject emits, which is a later, user-driven
 * reload, so its body is not the init path. A `.subscribe(...)` handler on a subscription made at
 * init runs as part of that initial load, so anything it calls IS the init path. Missing that let a
 * fetch hide one callback deep (`ngOnInit -> subscribe(() => this.loadFriendRequests())`) while
 * CODE-STYLE.md rule 16 bans "a private method any of those call".
 */
function walkEager(node: AnyNode | null | undefined, visit: (n: AnyNode) => void): void {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visit(node);
  // Only a subscription that EMITS at init carries its handler onto the init path: one whose chain
  // issues a request, or an ActivatedRoute stream, which emits synchronously. Subscribing to a
  // user-driven subject (`search$.pipe(debounceTime(...)).subscribe(...)`) runs its handler when the
  // user acts, so descending into it would report every debounced search box.
  const descendIntoClosures = isSubscribeCall(node)
    && (chainHeadIsInvocation(node.callee as AnyNode | undefined) || routeStreamSubscribe(node));
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
      if (isClosure && !(descendIntoClosures && key === 'arguments')) {
        continue;
      }
      walkEager(candidate, visit);
    }
  }
}

const OPERATOR_CALLS = ['pipe', 'subscribe'];

/**
 * True when the observable being subscribed to was PRODUCED by a method call in this chain.
 *
 * `this.api.get(x).pipe(...).subscribe(...)` -> the chain contains `get(...)`, so the request is
 * issued now. `this.requests$.pipe(...).subscribe(...)` contains only `pipe`, so it is wiring onto
 * an existing subject and nothing is requested until something emits. `this.form.valueChanges
 * .subscribe(...)` contains no call at all. That is the whole discrimination the rule rests on.
 */
function chainHeadIsInvocation(callee: AnyNode | undefined): boolean {
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

/** A fetch performed NOW: `<service call chain>.subscribe(...)`, `firstValueFrom(...)`, `toSignal(...)`. */
function isEagerFetch(node: AnyNode): boolean {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const name = calleeName(node);
  if (name && FETCH_FUNCTIONS.includes(name)) {
    // Same discrimination as `.subscribe`, applied to the wrapped observable:
    // `toSignal(this.api.get())` requests, `toSignal(this.router.events.pipe(...))` does not.
    return chainHeadIsInvocation(((node.arguments as AnyNode[]) ?? [])[0]);
  }
  if (name && FETCH_TERMINATORS.includes(name)) {
    // `this.requests$.pipe(...).subscribe(...)` is WIRING: the chain starts at a field, so nothing
    // is requested until something emits. `this.api.get(x).subscribe(...)` starts at a call and is
    // a request issued right now. That distinction is the whole rule.
    return chainHeadIsInvocation(node.callee as AnyNode);
  }
  return false;
}

/** `this.somethingSubject.next(...)` at init: kicking a pipeline is an eager load by another name. */
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

/** Walk everything, closures included. Used only to look inside a handler we already suspect. */
function walkAll(node: AnyNode | null | undefined, visit: (n: AnyNode) => void): void {
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
        walkAll(candidate, visit);
      }
    }
  }
}

/**
 * `this.route.queryParams.subscribe(p => this.load(p))` on the init path.
 *
 * An ActivatedRoute stream emits its current value synchronously on subscribe, so this loads
 * immediately even though the chain contains no invocation and the fetch hides inside the handler.
 * It is the classic shape a resolver replaces, and it is invisible to the wiring/fetching test.
 */
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
  walkEager(body, node => {
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
  walkEager(body, node => {
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
          walkEager(body, inner => {
            if (isEagerFetch(inner)) {
              report(inner, where, 'initFetch');
            } else if (isPipelineKick(inner)) {
              report(inner, where, 'initKick');
            } else if (routeStreamSubscribe(inner)) {
              // Only a handler that actually loads: subscribing to read a param into a signal is fine.
              let loads = false;
              for (const arg of (inner.arguments as AnyNode[]) ?? []) {
                walkAll(arg, deep => {
                  if (isEagerFetch(deep) || isPipelineKick(deep)) {
                    loads = true;
                    return;
                  }
                  if (deep.type === 'CallExpression') {
                    const cal = deep.callee as AnyNode | undefined;
                    if (cal?.type === 'MemberExpression'
                      && (cal.object as AnyNode | undefined)?.type === 'ThisExpression') {
                      const named = (cal.property as unknown as { name?: string })?.name;
                      const target = named ? classMethodBody(classBody, named) : null;
                      if (target && bodyFetches(target)) {
                        loads = true;
                      }
                    }
                  }
                });
              }
              if (loads) {
                report(inner, `${where} -> an ActivatedRoute stream`, 'initFetch');
              }
            }
          });

          // One hop: an init statement calling a private method that fetches.
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

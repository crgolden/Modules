import { randomUUID } from 'node:crypto';
import { RuleTester } from 'eslint';
import { RuleNames } from './index';
import noClickNavigation, { ClickNavigationMessageIds } from './no-click-navigation';
import noComponentNavigation, { ComponentNavigationMessageIds } from './no-component-navigation';
import noComponentDataFetch, { ComponentDataFetchMessageIds } from './no-component-data-fetch';

function newHandlerName(): string {
  return `handler${randomUUID().replace(/-/g, '')}`;
}

const pagingHandler = newHandlerName();
const viewHandler = newHandlerName();

const templateParser: unknown = require('@angular-eslint/template-parser');
const tsParser: unknown = require('@typescript-eslint/parser');

const templateTester = new RuleTester({
  languageOptions: { parser: templateParser as never },
});

const tsTester = new RuleTester({
  languageOptions: { parser: tsParser as never, ecmaVersion: 2022, sourceType: 'module' },
});

templateTester.run(RuleNames.noClickNavigation, noClickNavigation, {
  valid: [
    { code: '<a routerLink="/churches" (click)="menuOpen.set(false)">Browse</a>' },
    { code: '<a [routerLink]="[\'/churches\']" (click)="close()">Browse</a>' },
    { code: '<a [href]="\'#\' + item.id" (click)="scrollToId(item.id, $event)">Jump</a>' },
    { code: '<a routerLink="/library" (click)="open()">Library</a>', options: [{ navigationMethods: ['open'] }] },
    { code: `<a routerLink="/x" (click)="nav.${pagingHandler}(1)">X</a>`, options: [{ navigationMethods: [pagingHandler] }] },
    { code: '<button (click)="nextPage()">Next</button>' },
    { code: '<button (click)="prevPage()">Prev</button>' },
    { code: '<a href="/bff/login">Sign in</a>' },
    { code: '<button (click)="deleteSchedule(s.id)">Delete</button>' },
    { code: '<button (click)="cancelDelete()">No</button>' },
    { code: '<button (click)="toggleAddManual()">Add</button>' },
    { code: '<form (submit)="$event.preventDefault(); search()"><button type="submit">Go</button></form>' },
  ],
  invalid: [
    {
      code: '<a href="#" (click)="$event.preventDefault(); back()">Back</a>',
      errors: [{ messageId: ClickNavigationMessageIds.placeholderHref }],
    },
    {
      code: '<a (click)="back()">Back</a>',
      errors: [{ messageId: ClickNavigationMessageIds.anchorWithoutHref }],
    },
    {
      code: `<button id="btn-next-page" (click)="${pagingHandler}(page() + 1)">Next</button>`,
      options: [{ navigationMethods: [pagingHandler] }],
      errors: [{ messageId: ClickNavigationMessageIds.clickNavigation }],
    },
    {
      code: `<button (click)="${viewHandler}('grid')">Grid</button>`,
      options: [{ navigationMethods: [viewHandler] }],
      errors: [{ messageId: ClickNavigationMessageIds.clickNavigation }],
    },
    {
      code: '<button (click)="sortBy(\'Name\')">Name</button>',
      options: [{ navigationMethods: ['sortBy'] }],
      errors: [{ messageId: ClickNavigationMessageIds.clickNavigation }],
    },
    {
      code: '<button (click)="paginator.nextPage()">Next</button>',
      options: [{ navigationMethods: ['nextPage'] }],
      errors: [{ messageId: ClickNavigationMessageIds.clickNavigation }],
    },
    {
      code: `@for (p of pageWindow(); track p) {\n  <button class="page-number" [class.active]="p === page()" (click)="${pagingHandler}(p)">{{ p }}</button>\n}`,
      options: [{ navigationMethods: [pagingHandler] }],
      errors: [{ messageId: ClickNavigationMessageIds.clickNavigation }],
    },
    {
      code: `@if (totalPages() > 1) {\n  <button (click)="${pagingHandler}(1)">First</button>\n}`,
      options: [{ navigationMethods: [pagingHandler] }],
      errors: [{ messageId: ClickNavigationMessageIds.clickNavigation }],
    },
    {
      code: '<div>@for (p of pages; track p) { <a (click)="jump(p)">{{ p }}</a> }</div>',
      errors: [{ messageId: ClickNavigationMessageIds.anchorWithoutHref }],
    },
  ],
});

const COMPONENT_HEADER = '@Component({ selector: "app-x", template: "" })\nexport class XComponent {\n';
const COMPONENT_FOOTER = '\n}\n';

function component(body: string): string {
  return COMPONENT_HEADER + body + COMPONENT_FOOTER;
}

tsTester.run(RuleNames.noComponentNavigation, noComponentNavigation, {
  valid: [
    {
      code: component('  save() {\n    this.api.save().subscribe(id => { void this.router.navigate(["/products", id]); });\n  }'),
    },
    {
      code: component('  load() {\n    this.api.get().then(() => { void this.router.navigateByUrl("/x"); });\n  }'),
    },
    {
      code: component('  submit() {\n    this.api.post().subscribe({ error: () => { void this.router.navigate(["/"]); } });\n  }'),
    },
    {
      code: 'export const authGuard = () => {\n  globalThis.location.href = "/bff/login";\n  return false;\n};',
    },
    {
      code: 'export const productResolver = () => {\n  void router.navigate(["/products/not-found"]);\n};',
    },
    {
      code: component('  search() {\n    void this.router.navigate(["/churches"], { queryParams: this.params() });\n  }'),
      options: [{ exemptMethods: ['search'] }],
    },
    {
      code: component('  toggle() {\n    this.open.set(!this.open());\n  }'),
    },
  ],
  invalid: [
    {
      code: component('  goToPage(p: number) {\n    void this.router.navigate([], { queryParams: { page: p } });\n  }'),
      errors: [{ messageId: ComponentNavigationMessageIds.componentNavigation }],
    },
    {
      code: component('  setView(mode: string) {\n    void this.router.navigate([], { queryParams: { view: mode } });\n  }'),
      errors: [{ messageId: ComponentNavigationMessageIds.componentNavigation }],
    },
    {
      code: component('  signIn() {\n    globalThis.location.href = "/bff/login";\n  }'),
      errors: [{ messageId: ComponentNavigationMessageIds.componentNavigation }],
    },
    {
      code: component('  search() {\n    void this.router.navigate(["/churches"], { queryParams: this.params() });\n  }'),
      errors: [{ messageId: ComponentNavigationMessageIds.componentNavigation }],
    },
  ],
});

tsTester.run(RuleNames.noComponentDataFetch, noComponentDataFetch, {
  valid: [
    {
      name: 'a subject chain is wiring, not fetching: nothing is requested until the subject emits',
      code: component('  constructor() {\n    this.requests$.pipe(switchMap((q) => this.api.search(q))).subscribe((r) => this.rows.set(r));\n  }'),
    },
    {
      name: 'reading the payload a resolver already supplied',
      code: component('  ngOnInit() {\n    this.rows.set(this.route.snapshot.data["rows"]);\n  }'),
    },
    {
      name: 'a form stream is not a data fetch, and its chain contains no call at all',
      code: component('  constructor() {\n    this.form.valueChanges.subscribe((v) => this.formSignal.set(v));\n  }'),
    },
    {
      name: 'a router-event stream is the same shape: a member chain with no invocation',
      code: component('  constructor() {\n    this.router.events.pipe(takeUntilDestroyed()).subscribe(() => this.close());\n  }'),
    },
    {
      name: 'a user handler may fetch, because the rule is about the init path only',
      code: component('  onSearch(term: string) {\n    this.api.search(term).subscribe((r) => this.rows.set(r));\n  }'),
    },
    {
      name: 'a resolver fetching is the shape the rule asks for',
      code: 'export const thingResolver = () => {\n  return inject(Api).get().pipe(catchError(() => of(null)));\n};',
    },
    {
      name: 'an init call that is not a request at all',
      code: component('  ngOnInit() {\n    this.titleService.setTitle("x");\n  }'),
    },
    {
      name: 'a fetching private method named in exemptMethods',
      code: component('  ngOnInit() {\n    this.reload();\n  }'),
      options: [{ exemptMethods: ['reload'] }],
    },
    {
      name: 'reading a route param into a signal is not loading, so the stream arm stays quiet',
      code: component('  ngOnInit() {\n    this.route.queryParams.subscribe((p) => this.page.set(p["page"]));\n  }'),
    },
    {
      name: 'toSignal over a router-event stream produces no request',
      code: component('  private readonly last = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd)), { initialValue: null });'),
    },
    {
      name: 'a debounced search box: its handler runs when the user types, so the kick inside it is user-driven',
      code: component('  ngOnInit() {\n    this.search$.pipe(debounceTime(300)).subscribe(() => {\n      this.page.set(1);\n      this.load$.next();\n    });\n  }'),
    },
  ],
  invalid: [
    {
      name: 'a service call subscribed in ngOnInit',
      code: component('  ngOnInit() {\n    this.api.getChurchBySlug(this.slug).subscribe((c) => this.church.set(c));\n  }'),
      errors: [{ messageId: ComponentDataFetchMessageIds.initFetch }],
    },
    {
      name: 'ngOnInit calling a private method that fetches',
      code: component('  ngOnInit() {\n    this.loadChurch();\n  }\n  private loadChurch() {\n    this.api.getChurchBySlug(this.slug).subscribe((c) => this.church.set(c));\n  }'),
      errors: [{ messageId: ComponentDataFetchMessageIds.initFetch }],
    },
    {
      name: 'toSignal over a service call in a field initialiser',
      code: component('  protected readonly denominations = toSignal(this.churchService.getDenominations());'),
      errors: [{ messageId: ComponentDataFetchMessageIds.initFetch }],
    },
    {
      name: 'kicking a request pipeline in ngOnInit',
      code: component('  ngOnInit() {\n    this.load$.next();\n  }'),
      errors: [{ messageId: ComponentDataFetchMessageIds.initKick }],
    },
    {
      name: 'awaiting firstValueFrom over a service call in ngOnInit',
      code: component('  async ngOnInit() {\n    const rows = await firstValueFrom(this.api.search());\n    this.rows.set(rows);\n  }'),
      errors: [{ messageId: ComponentDataFetchMessageIds.initFetch }],
    },
    {
      name: 'a resolver supplying ONE payload does not license fetching the rest in-component',
      code: component('  ngOnInit() {\n    this.status.set(this.route.snapshot.data["status"]);\n    this.loadPreferences();\n  }\n  private loadPreferences() {\n    this.api.getPreferences().subscribe((p) => this.prefs.set(p));\n  }'),
      errors: [{ messageId: ComponentDataFetchMessageIds.initFetch }],
    },
    {
      name: 'an ActivatedRoute stream whose handler loads, though the chain has no invocation',
      code: component('  ngOnInit() {\n    this.route.queryParams.subscribe((p) => this.load(p));\n  }\n  private load(p: object) {\n    this.api.search(p).subscribe((r) => this.rows.set(r));\n  }'),
      errors: [{ messageId: ComponentDataFetchMessageIds.initFetch }, { messageId: ComponentDataFetchMessageIds.initFetch }],
    },
    {
      name: 'a fetch indirected one callback deep, inside a subscribe handler',
      code: component('  ngOnInit() {\n    this.api.getMe().subscribe(() => this.loadFriendRequests());\n  }\n  private loadFriendRequests() {\n    this.api.getRequests().subscribe((r) => this.requests.set(r));\n  }'),
      errors: [{ messageId: ComponentDataFetchMessageIds.initFetch }, { messageId: ComponentDataFetchMessageIds.initFetch }],
    },
  ],
});

process.stdout.write('eslint-angular: all rule fixtures passed\n');

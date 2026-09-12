import { RuleTester } from 'eslint';
import noClickNavigation from './no-click-navigation';
import noComponentNavigation from './no-component-navigation';
import noComponentDataFetch from './no-component-data-fetch';

const templateParser: unknown = require('@angular-eslint/template-parser');
const tsParser: unknown = require('@typescript-eslint/parser');

const templateTester = new RuleTester({
  languageOptions: { parser: templateParser as never },
});

const tsTester = new RuleTester({
  languageOptions: { parser: tsParser as never, ecmaVersion: 2022, sourceType: 'module' },
});

templateTester.run('no-click-navigation', noClickNavigation, {
  valid: [
    { code: '<a routerLink="/churches" (click)="menuOpen.set(false)">Browse</a>' },
    { code: '<a [routerLink]="[\'/churches\']" (click)="close()">Browse</a>' },
    { code: '<a [href]="\'#\' + item.id" (click)="scrollToId(item.id, $event)">Jump</a>' },
    { code: '<a routerLink="/library" (click)="open()">Library</a>', options: [{ navigationMethods: ['open'] }] },
    { code: '<a routerLink="/x" (click)="nav.goToPage(1)">X</a>', options: [{ navigationMethods: ['goToPage'] }] },
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
      errors: [{ messageId: 'placeholderHref' }],
    },
    {
      code: '<a (click)="back()">Back</a>',
      errors: [{ messageId: 'anchorWithoutHref' }],
    },
    {
      code: '<button id="btn-next-page" (click)="goToPage(page() + 1)">Next</button>',
      options: [{ navigationMethods: ['goToPage'] }],
      errors: [{ messageId: 'clickNavigation' }],
    },
    {
      code: '<button (click)="setView(\'grid\')">Grid</button>',
      options: [{ navigationMethods: ['setView'] }],
      errors: [{ messageId: 'clickNavigation' }],
    },
    {
      code: '<button (click)="sortBy(\'Name\')">Name</button>',
      options: [{ navigationMethods: ['sortBy'] }],
      errors: [{ messageId: 'clickNavigation' }],
    },
    {
      code: '<button (click)="paginator.nextPage()">Next</button>',
      options: [{ navigationMethods: ['nextPage'] }],
      errors: [{ messageId: 'clickNavigation' }],
    },
    {
      code: '@for (p of pageWindow(); track p) {\n  <button class="page-number" [class.active]="p === page()" (click)="goToPage(p)">{{ p }}</button>\n}',
      options: [{ navigationMethods: ['goToPage'] }],
      errors: [{ messageId: 'clickNavigation' }],
    },
    {
      code: '@if (totalPages() > 1) {\n  <button (click)="goToPage(1)">First</button>\n}',
      options: [{ navigationMethods: ['goToPage'] }],
      errors: [{ messageId: 'clickNavigation' }],
    },
    {
      code: '<div>@for (p of pages; track p) { <a (click)="jump(p)">{{ p }}</a> }</div>',
      errors: [{ messageId: 'anchorWithoutHref' }],
    },
  ],
});

const COMPONENT_HEADER = '@Component({ selector: "app-x", template: "" })\nexport class XComponent {\n';
const COMPONENT_FOOTER = '\n}\n';

function component(body: string): string {
  return COMPONENT_HEADER + body + COMPONENT_FOOTER;
}

tsTester.run('no-component-navigation', noComponentNavigation, {
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
      errors: [{ messageId: 'componentNavigation' }],
    },
    {
      code: component('  setView(mode: string) {\n    void this.router.navigate([], { queryParams: { view: mode } });\n  }'),
      errors: [{ messageId: 'componentNavigation' }],
    },
    {
      code: component('  signIn() {\n    globalThis.location.href = "/bff/login";\n  }'),
      errors: [{ messageId: 'componentNavigation' }],
    },
    {
      code: component('  search() {\n    void this.router.navigate(["/churches"], { queryParams: this.params() });\n  }'),
      errors: [{ messageId: 'componentNavigation' }],
    },
  ],
});

tsTester.run('no-component-data-fetch', noComponentDataFetch, {
  valid: [
    {
      // WIRING, not fetching: the chain starts at a subject, so nothing is requested until it emits.
      code: component('  constructor() {\n    this.requests$.pipe(switchMap((q) => this.api.search(q))).subscribe((r) => this.rows.set(r));\n  }'),
    },
    {
      code: component('  ngOnInit() {\n    this.rows.set(this.route.snapshot.data["rows"]);\n  }'),
    },
    {
      // A form stream is not a data fetch, and its chain contains no call at all.
      code: component('  constructor() {\n    this.form.valueChanges.subscribe((v) => this.formSignal.set(v));\n  }'),
    },
    {
      // Router events, same shape: a member chain with no invocation.
      code: component('  constructor() {\n    this.router.events.pipe(takeUntilDestroyed()).subscribe(() => this.close());\n  }'),
    },
    {
      // A user handler may fetch; the rule is about the init path only.
      code: component('  onSearch(term: string) {\n    this.api.search(term).subscribe((r) => this.rows.set(r));\n  }'),
    },
    {
      code: 'export const thingResolver = () => {\n  return inject(Api).get().pipe(catchError(() => of(null)));\n};',
    },
    {
      code: component('  ngOnInit() {\n    this.titleService.setTitle("x");\n  }'),
    },
    {
      code: component('  ngOnInit() {\n    this.reload();\n  }'),
      options: [{ exemptMethods: ['reload'] }],
    },
    {
      // Reading a route param into a signal is not loading, so the stream arm must stay quiet.
      code: component('  ngOnInit() {\n    this.route.queryParams.subscribe((p) => this.page.set(p["page"]));\n  }'),
    },
    {
      // toSignal over a router-event stream is not a data fetch: the chain produces no request.
      code: component('  private readonly last = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd)), { initialValue: null });'),
    },
    {
      // Wiring a debounced search box: the handler runs when the user types, not at init, so the
      // kick inside it is user-driven and must not report.
      code: component('  ngOnInit() {\n    this.search$.pipe(debounceTime(300)).subscribe(() => {\n      this.page.set(1);\n      this.load$.next();\n    });\n  }'),
    },
  ],
  invalid: [
    {
      code: component('  ngOnInit() {\n    this.api.getChurchBySlug(this.slug).subscribe((c) => this.church.set(c));\n  }'),
      errors: [{ messageId: 'initFetch' }],
    },
    {
      code: component('  ngOnInit() {\n    this.loadChurch();\n  }\n  private loadChurch() {\n    this.api.getChurchBySlug(this.slug).subscribe((c) => this.church.set(c));\n  }'),
      errors: [{ messageId: 'initFetch' }],
    },
    {
      code: component('  protected readonly denominations = toSignal(this.churchService.getDenominations());'),
      errors: [{ messageId: 'initFetch' }],
    },
    {
      code: component('  ngOnInit() {\n    this.load$.next();\n  }'),
      errors: [{ messageId: 'initKick' }],
    },
    {
      code: component('  async ngOnInit() {\n    const rows = await firstValueFrom(this.api.search());\n    this.rows.set(rows);\n  }'),
      errors: [{ messageId: 'initFetch' }],
    },
    {
      // A resolver supplying ONE payload does not license fetching the rest in-component.
      code: component('  ngOnInit() {\n    this.status.set(this.route.snapshot.data["status"]);\n    this.loadPreferences();\n  }\n  private loadPreferences() {\n    this.api.getPreferences().subscribe((p) => this.prefs.set(p));\n  }'),
      errors: [{ messageId: 'initFetch' }],
    },
    {
      // An ActivatedRoute stream emits synchronously on subscribe, so this loads at init even
      // though the chain has no invocation and the fetch hides inside the handler.
      code: component('  ngOnInit() {\n    this.route.queryParams.subscribe((p) => this.load(p));\n  }\n  private load(p: object) {\n    this.api.search(p).subscribe((r) => this.rows.set(r));\n  }'),
      errors: [{ messageId: 'initFetch' }, { messageId: 'initFetch' }],
    },
    {
      // Indirected one callback deep. Rule 16 bans "a private method any of those call", and this
      // hid from the first version of the walker, which skipped every closure.
      code: component('  ngOnInit() {\n    this.api.getMe().subscribe(() => this.loadFriendRequests());\n  }\n  private loadFriendRequests() {\n    this.api.getRequests().subscribe((r) => this.requests.set(r));\n  }'),
      errors: [{ messageId: 'initFetch' }, { messageId: 'initFetch' }],
    },
  ],
});

process.stdout.write('eslint-angular: all rule fixtures passed\n');

import { RuleTester } from 'eslint';
import noClickNavigation from './no-click-navigation';
import noComponentNavigation from './no-component-navigation';

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

process.stdout.write('eslint-angular: all rule fixtures passed\n');

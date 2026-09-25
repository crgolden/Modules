import { Directive } from '@angular/core';

@Directive({
  selector: '[crgCard]',
  host: { class: 'rounded-md border border-t-(length:--card-rule) border-line bg-surface shadow-card' },
})
export class CardDirective {}

@Directive({
  selector: '[crgCardAccent]',
  host: { class: 'rounded-md border border-t-(length:--card-rule) border-line border-t-accent bg-surface shadow-card' },
})
export class CardAccentDirective {}

@Directive({
  selector: '[crgPageContainer]',
  host: { class: 'mx-auto max-w-page px-6 max-sm:px-4' },
})
export class PageContainerDirective {}

@Directive({
  selector: '[crgPageSection]',
  host: { class: 'pt-8 pb-12' },
})
export class PageSectionDirective {}

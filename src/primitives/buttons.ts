import { Directive } from '@angular/core';

@Directive({
  selector: 'button[crgButtonPrimary], a[crgButtonPrimary]',
  host: { class: 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm bg-accent px-5 py-2.5 font-body text-body font-semibold whitespace-nowrap text-on-fill no-underline transition-[background-color,translate] duration-200 ease-out hover:not-disabled:bg-accent-hover hover:not-disabled:text-on-fill active:not-disabled:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none' },
})
export class ButtonPrimaryDirective {}

@Directive({
  selector: 'button[crgButtonPrimarySmall], a[crgButtonPrimarySmall]',
  host: { class: 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm bg-accent px-3 py-1.5 font-body text-small font-semibold whitespace-nowrap text-on-fill no-underline transition-[background-color,translate] duration-200 ease-out hover:not-disabled:bg-accent-hover hover:not-disabled:text-on-fill active:not-disabled:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none' },
})
export class ButtonPrimarySmallDirective {}

@Directive({
  selector: 'button[crgButtonSecondary], a[crgButtonSecondary]',
  host: { class: 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border-[1.5px] border-accent bg-transparent px-5 py-2.5 font-body text-body font-medium text-accent no-underline transition-[background-color,color] duration-200 ease-out hover:not-disabled:bg-accent/6 hover:not-disabled:text-accent disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none' },
})
export class ButtonSecondaryDirective {}

@Directive({
  selector: 'button[crgButtonGhost], a[crgButtonGhost]',
  host: { class: 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-line-strong bg-transparent px-4 py-2 font-body text-meta font-medium text-text-muted no-underline transition-[background-color,border-color] duration-200 ease-out hover:not-disabled:border-text-muted hover:not-disabled:bg-canvas hover:not-disabled:text-text-muted disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none' },
})
export class ButtonGhostDirective {}

@Directive({
  selector: 'button[crgButtonGhostSmall], a[crgButtonGhostSmall]',
  host: { class: 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-line-strong bg-transparent px-3 py-1.5 font-body text-small font-medium text-text-muted no-underline transition-[background-color,border-color] duration-200 ease-out hover:not-disabled:border-text-muted hover:not-disabled:bg-canvas hover:not-disabled:text-text-muted disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none' },
})
export class ButtonGhostSmallDirective {}

@Directive({
  selector: 'button[crgButtonGhostDanger], a[crgButtonGhostDanger]',
  host: { class: 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-danger bg-transparent px-4 py-2 font-body text-meta font-medium text-danger no-underline transition-[background-color,border-color] duration-200 ease-out hover:not-disabled:bg-danger/8 hover:not-disabled:text-danger disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none' },
})
export class ButtonGhostDangerDirective {}

@Directive({
  selector: 'button[crgButtonGhostDangerSmall], a[crgButtonGhostDangerSmall]',
  host: { class: 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-danger bg-transparent px-3 py-1.5 font-body text-small font-medium text-danger no-underline transition-[background-color,border-color] duration-200 ease-out hover:not-disabled:bg-danger/8 hover:not-disabled:text-danger disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none' },
})
export class ButtonGhostDangerSmallDirective {}

@Directive({
  selector: 'button[crgButtonDanger], a[crgButtonDanger]',
  host: { class: 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-danger bg-danger px-4 py-2 font-body text-body font-semibold text-on-fill no-underline transition-[background-color,border-color] duration-200 ease-out hover:not-disabled:border-danger-hover hover:not-disabled:bg-danger-hover hover:not-disabled:text-on-fill disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none' },
})
export class ButtonDangerDirective {}

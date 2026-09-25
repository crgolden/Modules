export const ScrollRestorationModes = {
  auto: 'auto',
  manual: 'manual',
} as const;

export const BEFORE_UNLOAD_EVENT = 'beforeunload';

export interface LeavableWindow {
  readonly history: { scrollRestoration: ScrollRestoration };
  addEventListener(type: typeof BEFORE_UNLOAD_EVENT, listener: () => void): void;
}

export function handScrollRestorationToTheBrowserOnLeave(
  documentWindow: LeavableWindow,
  onEveryNavigationStart: (reclaim: () => void) => void,
): void {
  documentWindow.addEventListener(BEFORE_UNLOAD_EVENT, () => {
    documentWindow.history.scrollRestoration = ScrollRestorationModes.auto;
  });
  onEveryNavigationStart(() => {
    documentWindow.history.scrollRestoration = ScrollRestorationModes.manual;
  });
}

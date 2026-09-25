import { isPlatformBrowser } from '@angular/common';
import {
  DOCUMENT,
  DestroyRef,
  EnvironmentProviders,
  PLATFORM_ID,
  inject,
  provideEnvironmentInitializer,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { handScrollRestorationToTheBrowserOnLeave } from '@crgolden/modules/scroll-restoration';

export function provideBrowserScrollRestorationWhenLeavingTheDocument(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }
    const documentWindow = inject(DOCUMENT).defaultView;
    if (documentWindow === null) {
      return;
    }
    const navigationStarts = inject(Router).events.pipe(
      filter((event) => event instanceof NavigationStart),
      takeUntilDestroyed(inject(DestroyRef)),
    );
    handScrollRestorationToTheBrowserOnLeave(documentWindow, (reclaim) => {
      navigationStarts.subscribe(reclaim);
    });
  });
}

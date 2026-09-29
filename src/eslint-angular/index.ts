import noClickNavigation from './no-click-navigation';
import noComponentNavigation from './no-component-navigation';
import noComponentDataFetch from './no-component-data-fetch';

export { ClickNavigationMessageIds, SUGGESTED_NAVIGATION_METHODS, handlerNameOf } from './no-click-navigation';
export { ComponentNavigationMessageIds, REDIRECT_CALLBACKS } from './no-component-navigation';
export { ComponentDataFetchMessageIds } from './no-component-data-fetch';

export const RuleNames = {
  noClickNavigation: 'no-click-navigation',
  noComponentNavigation: 'no-component-navigation',
  noComponentDataFetch: 'no-component-data-fetch',
} as const;

export const rules = {
  [RuleNames.noClickNavigation]: noClickNavigation,
  [RuleNames.noComponentNavigation]: noComponentNavigation,
  [RuleNames.noComponentDataFetch]: noComponentDataFetch,
};

export const plugin = {
  meta: { name: '@crgolden/eslint-angular' },
  rules,
};

export default plugin;

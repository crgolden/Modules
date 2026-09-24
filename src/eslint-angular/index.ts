import noClickNavigation, {
  ClickNavigationMessageIds,
  SUGGESTED_NAVIGATION_METHODS,
  handlerNameOf,
} from './no-click-navigation';
import noComponentNavigation, { ComponentNavigationMessageIds, REDIRECT_CALLBACKS } from './no-component-navigation';
import noComponentDataFetch, { ComponentDataFetchMessageIds } from './no-component-data-fetch';

export {
  ClickNavigationMessageIds,
  ComponentDataFetchMessageIds,
  ComponentNavigationMessageIds,
  SUGGESTED_NAVIGATION_METHODS,
  REDIRECT_CALLBACKS,
  handlerNameOf,
};

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

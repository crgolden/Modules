import noClickNavigation, { SUGGESTED_NAVIGATION_METHODS, handlerNameOf } from './no-click-navigation';
import noComponentNavigation, { REDIRECT_CALLBACKS } from './no-component-navigation';
import noComponentDataFetch from './no-component-data-fetch';

export { SUGGESTED_NAVIGATION_METHODS, REDIRECT_CALLBACKS, handlerNameOf };

export const rules = {
  'no-click-navigation': noClickNavigation,
  'no-component-navigation': noComponentNavigation,
  'no-component-data-fetch': noComponentDataFetch,
};

export const plugin = {
  meta: { name: '@crgolden/eslint-angular' },
  rules,
};

export default plugin;

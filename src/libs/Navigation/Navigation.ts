import {findFocusedRoute, getActionFromState} from '@react-navigation/core';
import type {EventArg, NavigationAction, NavigationContainerEventMap} from '@react-navigation/native';
import {CommonActions, getPathFromState, StackActions} from '@react-navigation/native';
// eslint-disable-next-line you-dont-need-lodash-underscore/omit
import omit from 'lodash/omit';
import {InteractionManager} from 'react-native';
import type {OnyxEntry} from 'react-native-onyx';
import Onyx from 'react-native-onyx';
import type {Writable} from 'type-fest';
import getIsNarrowLayout from '@libs/getIsNarrowLayout';
import Log from '@libs/Log';
import {shallowCompare} from '@libs/ObjectUtils';
import CONST from '@src/CONST';
import NAVIGATORS from '@src/NAVIGATORS';
import ONYXKEYS from '@src/ONYXKEYS';
import type {Route} from '@src/ROUTES';
import ROUTES from '@src/ROUTES';
import SCREENS, {PROTECTED_SCREENS} from '@src/SCREENS';
import type {Account} from '@src/types/onyx';
import getInitialSplitNavigatorState from './AppNavigator/createSplitNavigator/getInitialSplitNavigatorState';
import originalCloseRHPFlow from './helpers/closeRHPFlow';
import getStateFromPath from './helpers/getStateFromPath';
import getTopmostReportParams from './helpers/getTopmostReportParams';
import {isFullScreenName, isOnboardingFlowName, isSplitNavigatorName} from './helpers/isNavigatorName';
import isReportOpenInRHP from './helpers/isReportOpenInRHP';
import isSideModalNavigator from './helpers/isSideModalNavigator';
import linkTo from './helpers/linkTo';
import getMinimalAction from './helpers/linkTo/getMinimalAction';
import type {LinkToOptions} from './helpers/linkTo/types';
import replaceWithSplitNavigator from './helpers/replaceWithSplitNavigator';
import setNavigationActionToMicrotaskQueue from './helpers/setNavigationActionToMicrotaskQueue';
import {linkingConfig} from './linkingConfig';
import {SPLIT_TO_SIDEBAR} from './linkingConfig/RELATIONS';
import navigationRef from './navigationRef';
import type {NavigationPartialRoute, NavigationRoute, NavigationStateRoute, ReportsSplitNavigatorParamList, RootNavigatorParamList, State} from './types';

// Routes which are part of the flow to set up 2FA
const SET_UP_2FA_ROUTES: Route[] = [
    ROUTES.REQUIRE_TWO_FACTOR_AUTH,
    ROUTES.SETTINGS_2FA_ROOT.getRoute(ROUTES.REQUIRE_TWO_FACTOR_AUTH),
    ROUTES.SETTINGS_2FA_VERIFY.getRoute(ROUTES.REQUIRE_TWO_FACTOR_AUTH),
    ROUTES.SETTINGS_2FA_SUCCESS.getRoute(ROUTES.REQUIRE_TWO_FACTOR_AUTH),
];

let account: OnyxEntry<Account>;
Onyx.connect({
    key: ONYXKEYS.ACCOUNT,
    callback: (value) => {
        account = value;
    },
});

function shouldShowRequire2FAPage() {
    return !!account?.needsTwoFactorAuthSetup && !account?.requiresTwoFactorAuth;
}

let resolveNavigationIsReadyPromise: () => void;
const navigationIsReadyPromise = new Promise<void>((resolve) => {
    resolveNavigationIsReadyPromise = resolve;
});

let pendingRoute: Route | null = null;

let shouldPopToSidebar = false;

/**
 * Inform the navigation that next time user presses UP we should pop all the state back to LHN.
 */
function setShouldPopToSidebar(shouldPopAllStateFlag: boolean) {
    shouldPopToSidebar = shouldPopAllStateFlag;
}

/**
 * Returns shouldPopToSidebar variable used to determine whether should we pop all state back to LHN
 * @returns shouldPopToSidebar
 */
function getShouldPopToSidebar() {
    return shouldPopToSidebar;
}

type CanNavigateParams = {
    route?: Route;
    backToRoute?: Route;
};

/**
 * Checks if the route can be navigated to based on whether the navigation ref is ready and if 2FA is required to be set up.
 */
function canNavigate(methodName: string, params: CanNavigateParams = {}): boolean {
    // Block navigation if 2FA is required and the targetRoute is not part of the flow to enable 2FA
    const targetRoute = params.route ?? params.backToRoute;
    if (shouldShowRequire2FAPage() && targetRoute && !SET_UP_2FA_ROUTES.includes(targetRoute)) {
        Log.info(`[Navigation] Blocked navigation because 2FA is required to be set up to access route: ${targetRoute}`);
        return false;
    }
    if (navigationRef.isReady()) {
        return true;
    }
    Log.hmmm(`[Navigation] ${methodName} failed because navigation ref was not yet ready`, params);
    return false;
}

/**
 * Extracts from the topmost report its id.
 */
const getTopmostReportId = (state = navigationRef.getState()) => getTopmostReportParams(state)?.reportID;

/**
 * Extracts from the topmost report its action id.
 */
const getTopmostReportActionId = (state = navigationRef.getState()) => getTopmostReportParams(state)?.reportActionID;

/**
 * Re-exporting the closeRHPFlow here to fill in default value for navigationRef. The closeRHPFlow isn't defined in this file to avoid cyclic dependencies.
 */
const closeRHPFlow = (ref = navigationRef) => originalCloseRHPFlow(ref);

/**
 * Returns the current active route.
 */
function getActiveRoute(): string {
    const currentRoute = navigationRef.current && navigationRef.current.getCurrentRoute();
    if (!currentRoute?.name) {
        return '';
    }

    const routeFromState = getPathFromState(navigationRef.getRootState(), linkingConfig.config);

    if (routeFromState) {
        return routeFromState;
    }

    return '';
}
/**
 * Returns the route of a report opened in RHP.
 */
function getReportRHPActiveRoute(): string {
    if (isReportOpenInRHP(navigationRef.getRootState())) {
        return getActiveRoute();
    }
    return '';
}

/**
 * Cleans the route path by removing redundant slashes and query parameters.
 * @param routePath The route path to clean.
 * @returns The cleaned route path.
 */
function cleanRoutePath(routePath: string): string {
    return routePath.replace(CONST.REGEX.ROUTES.REDUNDANT_SLASHES, (match, p1) => (p1 ? '/' : '')).replace(/\?.*/, '');
}

/**
 * Check whether the passed route is currently Active or not.
 *
 * Building path with getPathFromState since navigationRef.current.getCurrentRoute().path
 * is undefined in the first navigation.
 *
 * @param routePath Path to check
 * @return is active
 */
function isActiveRoute(routePath: Route): boolean {
    let activeRoute = getActiveRouteWithoutParams();
    activeRoute = activeRoute.startsWith('/') ? activeRoute.substring(1) : activeRoute;

    // We remove redundant (consecutive and trailing) slashes from path before matching
    return cleanRoutePath(activeRoute) === cleanRoutePath(routePath);
}

/**
 * Navigates to a specified route.
 * Main navigation method for redirecting to a route.
 * For detailed information about moving between screens,
 * see the NAVIGATION.md documentation.
 *
 * @param route - The route to navigate to.
 * @param options - Optional navigation options.
 * @param options.forceReplace - If true, the navigation action will replace the current route instead of pushing a new one.
 */
function navigate(route: Route, options?: LinkToOptions) {
    if (!canNavigate('navigate', {route})) {
        if (!navigationRef.isReady()) {
            // Store intended route if the navigator is not yet available,
            // we will try again after the NavigationContainer is ready
            Log.hmmm(`[Navigation] Container not yet ready, storing route as pending: ${route}`);
            pendingRoute = route;
        }
        return;
    }

    linkTo(navigationRef.current, route, options);
}

/**
 * When routes are compared to determine whether the fallback route passed to the goUp function is in the state,
 * these parameters shouldn't be included in the comparison.
 */
const routeParamsIgnore = ['path', 'initial', 'params', 'state', 'screen', 'policyID', 'pop'];

/**
 * @private
 * If we use destructuring, we will get an error if any of the ignored properties are not present in the object.
 */
function getRouteParamsToCompare(routeParams: Record<string, string | undefined>) {
    return omit(routeParams, routeParamsIgnore);
}

/**
 * @private
 * Private method used in goUp to determine whether a target route is present in the navigation state.
 */
function doesRouteMatchToMinimalActionPayload(route: NavigationStateRoute | NavigationPartialRoute, minimalAction: Writable<NavigationAction>, compareParams: boolean) {
    if (!minimalAction.payload) {
        return false;
    }

    if (!('name' in minimalAction.payload)) {
        return false;
    }

    const areRouteNamesEqual = route.name === minimalAction.payload.name;

    if (!areRouteNamesEqual) {
        return false;
    }

    if (!compareParams) {
        return true;
    }

    if (!('params' in minimalAction.payload)) {
        return false;
    }

    const routeParams = getRouteParamsToCompare(route.params as Record<string, string | undefined>);
    const minimalActionParams = getRouteParamsToCompare(minimalAction.payload.params as Record<string, string | undefined>);

    return shallowCompare(routeParams, minimalActionParams);
}

/**
 * @private
 * Checks whether the given state is the root navigator state
 */
function isRootNavigatorState(state: State): state is State<RootNavigatorParamList> {
    return state.key === navigationRef.current?.getRootState().key;
}

type GoBackOptions = {
    /**
     * If we should compare params when searching for a route in state to go up to.
     * There are situations where we want to compare params when going up e.g. goUp to a specific report.
     * Sometimes we want to go up and update params of screen e.g. country picker.
     * In that case we want to goUp to a country picker with any params so we don't compare them.
     */
    compareParams?: boolean;
};

const defaultGoBackOptions: Required<GoBackOptions> = {
    compareParams: true,
};

/**
 * @private
 * Navigate to the given backToRoute taking into account whether it is possible to go back to this screen. Within one nested navigator, we can go back by any number
 * of screens, but if as a result of going back we would have to remove more than one screen from the rootState,
 * replace is performed so as not to lose the visited pages.
 * If backToRoute is not found in the state, replace is also called then.
 *
 * @param backToRoute - The route to go up.
 * @param options - Optional configuration that affects navigation logic, such as parameter comparison.
 */
function goUp(backToRoute: Route, options?: GoBackOptions) {
    if (!canNavigate('goUp', {backToRoute}) || !navigationRef.current) {
        Log.hmmm(`[Navigation] Unable to go up. Can't navigate.`);
        return;
    }

    const compareParams = options?.compareParams ?? defaultGoBackOptions.compareParams;

    const rootState = navigationRef.current.getRootState();
    const stateFromPath = getStateFromPath(backToRoute);

    const action = getActionFromState(stateFromPath, linkingConfig.config);

    if (!action) {
        Log.hmmm(`[Navigation] Unable to go up. Action is undefined.`);
        return;
    }

    const {action: minimalAction, targetState} = getMinimalAction(action, rootState);

    if (minimalAction.type !== CONST.NAVIGATION.ACTION_TYPE.NAVIGATE || !targetState) {
        Log.hmmm('[Navigation] Unable to go up. Minimal action type is wrong.');
        return;
    }

    const indexOfBackToRoute = targetState.routes.findLastIndex((route) => doesRouteMatchToMinimalActionPayload(route, minimalAction, compareParams));
    const distanceToPop = targetState.routes.length - indexOfBackToRoute - 1;

    // If we need to pop more than one route from rootState, we replace the current route to not lose visited routes from the navigation state
    if (indexOfBackToRoute === -1 || (isRootNavigatorState(targetState) && distanceToPop > 1)) {
        const replaceAction = {...minimalAction, type: CONST.NAVIGATION.ACTION_TYPE.REPLACE} as NavigationAction;
        navigationRef.current.dispatch(replaceAction);
        return;
    }

    /**
     * If we are not comparing params, we want to use popTo action because it will replace params in the route already existing in the state if necessary.
     */
    if (!compareParams) {
        navigationRef.current.dispatch({...minimalAction, type: CONST.NAVIGATION.ACTION_TYPE.POP_TO});
        return;
    }

    navigationRef.current.dispatch({...StackActions.pop(distanceToPop), target: targetState.key});
}

/**
 * Navigate back to the previous screen or a specified route.
 * For detailed information about navigation patterns and best practices,
 * see the NAVIGATION.md documentation.
 * @param backToRoute - Fallback route if pop/goBack action should, but is not possible within RHP
 * @param options - Optional configuration that affects navigation logic
 */
function goBack(backToRoute?: Route, options?: GoBackOptions) {
    if (!canNavigate('goBack', {backToRoute})) {
        return;
    }

    if (backToRoute) {
        goUp(backToRoute, options);
        return;
    }

    if (!navigationRef.current?.canGoBack()) {
        Log.hmmm('[Navigation] Unable to go back');
        return;
    }

    navigationRef.current?.goBack();
}

/**
 * Navigate back to the sidebar screen in SplitNavigator and pop all central screens from the navigator at the same time.
 * For detailed information about moving between screens,
 * see the NAVIGATION.md documentation.
 */
function popToSidebar() {
    setShouldPopToSidebar(false);

    const rootState = navigationRef.current?.getRootState();
    const currentRoute = rootState?.routes.at(-1);

    if (!currentRoute) {
        Log.hmmm('[popToSidebar] Unable to pop to sidebar, no current root found in navigator');
        return;
    }

    if (!isSplitNavigatorName(currentRoute?.name)) {
        Log.hmmm('[popToSidebar] must be invoked only from SplitNavigator');
        return;
    }

    const topRoute = currentRoute.state?.routes.at(0);
    const lastRoute = currentRoute.state?.routes.at(-1);

    const currentRouteName = currentRoute?.name as keyof typeof SPLIT_TO_SIDEBAR;
    if (topRoute?.name !== SPLIT_TO_SIDEBAR[currentRouteName]) {
        const params = currentRoute.name === NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR ? {...lastRoute?.params} : undefined;

        const sidebarName = SPLIT_TO_SIDEBAR[currentRouteName];

        navigationRef.dispatch({payload: {name: sidebarName, params}, type: CONST.NAVIGATION.ACTION_TYPE.REPLACE});
        return;
    }

    navigationRef.current?.dispatch(StackActions.popToTop());
}

/**
 * Reset the navigation state to Home page.
 */
function resetToHome() {
    const isNarrowLayout = getIsNarrowLayout();
    const rootState = navigationRef.getRootState();
    navigationRef.dispatch({...StackActions.popToTop(), target: rootState.key});
    const splitNavigatorMainScreen = !isNarrowLayout
        ? {
              name: SCREENS.REPORT,
          }
        : undefined;
    const payload = getInitialSplitNavigatorState({name: SCREENS.HOME}, splitNavigatorMainScreen);
    navigationRef.dispatch({payload, type: CONST.NAVIGATION.ACTION_TYPE.REPLACE, target: rootState.key});
}

/**
 * The goBack function doesn't support recursive pop e.g. pop route from root and then from nested navigator.
 * There is only one case where recursive pop is needed which is going back to home.
 * This function will cover this case.
 * We will implement recursive pop if more use cases will appear.
 */
function goBackToHome() {
    const isNarrowLayout = getIsNarrowLayout();

    // This set the right split navigator.
    goBack(ROUTES.HOME);

    // We want to keep the report screen in the split navigator on wide layout.
    if (!isNarrowLayout) {
        return;
    }

    // This set the right route in this split navigator.
    goBack(ROUTES.HOME);
}

/**
 * Update route params for the specified route.
 */
function setParams(params: Record<string, unknown>, routeKey = '') {
    navigationRef.current?.dispatch({
        ...CommonActions.setParams(params),
        source: routeKey,
    });
}

/**
 * Returns the current active route without the URL params.
 */
function getActiveRouteWithoutParams(): string {
    return getActiveRoute().replace(/\?.*/, '');
}

/**
 * Returns the active route name from a state event from the navigationRef.
 */
function getRouteNameFromStateEvent(event: EventArg<'state', false, NavigationContainerEventMap['state']['data']>): string | undefined {
    if (!event.data.state) {
        return;
    }
    const currentRouteName = event.data.state.routes.at(-1)?.name;

    // Check to make sure we have a route name
    if (currentRouteName) {
        return currentRouteName;
    }
}

/**
 * @private
 * Navigate to the route that we originally intended to go to
 * but the NavigationContainer was not ready when navigate() was called
 */
function goToPendingRoute() {
    if (pendingRoute === null) {
        return;
    }
    Log.hmmm(`[Navigation] Container now ready, going to pending route: ${pendingRoute}`);
    navigate(pendingRoute);
    pendingRoute = null;
}

function isNavigationReady(): Promise<void> {
    return navigationIsReadyPromise;
}

function setIsNavigationReady() {
    goToPendingRoute();
    resolveNavigationIsReadyPromise();
}

/**
 * @private
 * Checks if the navigation state contains routes that are protected (over the auth wall).
 *
 * @param state - react-navigation state object
 */
function navContainsProtectedRoutes(state: State | undefined): boolean {
    if (!state?.routeNames || !Array.isArray(state.routeNames)) {
        return false;
    }

    // If one protected screen is in the routeNames then other screens are there as well.
    return state?.routeNames.includes(PROTECTED_SCREENS.CONCIERGE);
}

/**
 * Waits for the navigation state to contain protected routes specified in PROTECTED_SCREENS constant.
 * If the navigation is in a state, where protected routes are available, the promise resolve immediately.
 *
 * @function
 * @returns A promise that resolves when the one of the PROTECTED_SCREENS screen is available in the nav tree.
 *
 * @example
 * waitForProtectedRoutes()
 *     .then(()=> console.log('Protected routes are present!'))
 */
function waitForProtectedRoutes() {
    return new Promise<void>((resolve) => {
        isNavigationReady().then(() => {
            const currentState = navigationRef.current?.getState();
            if (navContainsProtectedRoutes(currentState)) {
                resolve();
                return;
            }

            const unsubscribe = navigationRef.current?.addListener('state', ({data}) => {
                const state = data?.state;
                if (navContainsProtectedRoutes(state)) {
                    unsubscribe?.();
                    resolve();
                }
            });
        });
    });
}

function getReportRouteByID(reportID?: string, routes: NavigationRoute[] = navigationRef.getRootState().routes): NavigationRoute | null {
    if (!reportID || !routes?.length) {
        return null;
    }
    for (const route of routes) {
        if (route.name === SCREENS.REPORT && !!route.params && 'reportID' in route.params && route.params.reportID === reportID) {
            return route;
        }
        if (route.state?.routes) {
            const partialRoute = getReportRouteByID(reportID, route.state.routes);
            if (partialRoute) {
                return partialRoute;
            }
        }
    }
    return null;
}

/**
 * Closes the modal navigator (RHP, onboarding).
 * For detailed information about dismissing modals,
 * see the NAVIGATION.md documentation.
 */
const dismissModal = (ref = navigationRef) => {
    isNavigationReady().then(() => {
        ref.dispatch({type: CONST.NAVIGATION.ACTION_TYPE.DISMISS_MODAL});
        // Let React Navigation finish modal transition
        InteractionManager.runAfterInteractions(() => {
            fireModalDismissed();
        });
    });
};

/**
 * Dismisses the modal and opens the given report.
 * For detailed information about dismissing modals,
 * see the NAVIGATION.md documentation.
 */
const dismissModalWithReport = (
    {reportID, reportActionID, referrer, moneyRequestReportActionID, transactionID, backTo}: ReportsSplitNavigatorParamList[typeof SCREENS.REPORT],
    ref = navigationRef,
) => {
    isNavigationReady().then(() => {
        const topmostReportID = getTopmostReportId();
        const areReportsIDsDefined = !!topmostReportID && !!reportID;
        const isReportsSplitTopmostFullScreen = ref.getRootState().routes.findLast((route) => isFullScreenName(route.name))?.name === NAVIGATORS.REPORTS_SPLIT_NAVIGATOR;
        if (topmostReportID === reportID && areReportsIDsDefined && isReportsSplitTopmostFullScreen) {
            dismissModal();
            return;
        }
        const reportRoute = ROUTES.REPORT_WITH_ID.getRoute(reportID, reportActionID, referrer, moneyRequestReportActionID, transactionID, backTo);
        if (getIsNarrowLayout()) {
            navigate(reportRoute, {forceReplace: true});
            return;
        }
        dismissModal();
        InteractionManager.runAfterInteractions(() => {
            navigate(reportRoute);
        });
    });
};

/**
 * Returns to the first screen in the stack, dismissing all the others, only if the global variable shouldPopToSidebar is set to true.
 */
function popToTop() {
    if (!shouldPopToSidebar) {
        goBack();
        return;
    }

    shouldPopToSidebar = false;
    navigationRef.current?.dispatch(StackActions.popToTop());
}

function popRootToTop() {
    const rootState = navigationRef.getRootState();
    navigationRef.current?.dispatch({...StackActions.popToTop(), target: rootState.key});
}

function pop(target: string) {
    navigationRef.current?.dispatch({...StackActions.pop(), target});
}

function removeScreenFromNavigationState(screen: string) {
    isNavigationReady().then(() => {
        navigationRef.current?.dispatch((state) => {
            const routes = state.routes?.filter((item) => item.name !== screen);
            return CommonActions.reset({
                ...state,
                routes,
                index: routes.length < state.routes.length ? state.index - 1 : state.index,
            });
        });
    });
}

function isTopmostRouteModalScreen() {
    const topmostRouteName = navigationRef.getRootState()?.routes?.at(-1)?.name;
    return isSideModalNavigator(topmostRouteName);
}

function removeScreenByKey(key: string) {
    isNavigationReady().then(() => {
        navigationRef.current?.dispatch((state) => {
            const routes = state.routes?.filter((item) => item.key !== key);
            return CommonActions.reset({
                ...state,
                routes,
                index: routes.length < state.routes.length ? state.index - 1 : state.index,
            });
        });
    });
}

function isOnboardingFlow() {
    const state = navigationRef.getRootState();
    const currentFocusedRoute = findFocusedRoute(state);
    return isOnboardingFlowName(currentFocusedRoute?.name);
}

const modalDismissedListeners: Array<() => void> = [];

function onModalDismissedOnce(callback: () => void) {
    modalDismissedListeners.push(callback);
}

// Wrap modal dismissal so listeners get called
function fireModalDismissed() {
    while (modalDismissedListeners.length) {
        const cb = modalDismissedListeners.pop();
        cb?.();
    }
}

export default {
    setShouldPopToSidebar,
    getShouldPopToSidebar,
    popToSidebar,
    navigate,
    setParams,
    dismissModal,
    dismissModalWithReport,
    isActiveRoute,
    getActiveRoute,
    getActiveRouteWithoutParams,
    getReportRHPActiveRoute,
    goBack,
    isNavigationReady,
    setIsNavigationReady,
    getTopmostReportId,
    getRouteNameFromStateEvent,
    getTopmostReportActionId,
    waitForProtectedRoutes,
    resetToHome,
    goBackToHome,
    closeRHPFlow,
    setNavigationActionToMicrotaskQueue,
    popToTop,
    popRootToTop,
    pop,
    removeScreenFromNavigationState,
    removeScreenByKey,
    getReportRouteByID,
    replaceWithSplitNavigator,
    isTopmostRouteModalScreen,
    isOnboardingFlow,
    onModalDismissedOnce,
    fireModalDismissed,
};

export {navigationRef};

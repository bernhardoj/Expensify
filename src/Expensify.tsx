import HybridAppModule from '@expensify/react-native-hybrid-app';
import {Audio} from 'expo-av';
import React, {useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {NativeEventSubscription} from 'react-native';
import {AppState, Linking, Platform} from 'react-native';
import type {OnyxEntry} from 'react-native-onyx';
import Onyx from 'react-native-onyx';
import ConfirmModal from './components/ConfirmModal';
import DeeplinkWrapper from './components/DeeplinkWrapper';
import EmojiPicker from './components/EmojiPicker/EmojiPicker';
import GrowlNotification from './components/GrowlNotification';
import AppleAuthWrapper from './components/SignInButtons/AppleAuthWrapper';
import SplashScreenHider from './components/SplashScreenHider';
import UpdateAppModal from './components/UpdateAppModal';
import CONFIG from './CONFIG';
import CONST from './CONST';
import useDebugShortcut from './hooks/useDebugShortcut';
import useIsAuthenticated from './hooks/useIsAuthenticated';
import useLocalize from './hooks/useLocalize';
import useOnyx from './hooks/useOnyx';
import usePriorityMode from './hooks/usePriorityChange';
import {updateLastRoute} from './libs/actions/App';
import {disconnect} from './libs/actions/Delegate';
import * as EmojiPickerAction from './libs/actions/EmojiPickerAction';
import * as Report from './libs/actions/Report';
import * as User from './libs/actions/User';
import * as ActiveClientManager from './libs/ActiveClientManager';
import {isSafari} from './libs/Browser';
import * as Environment from './libs/Environment/Environment';
import FS from './libs/Fullstory';
import Growl, {growlRef} from './libs/Growl';
import Log from './libs/Log';
import migrateOnyx from './libs/migrateOnyx';
import Navigation from './libs/Navigation/Navigation';
import NavigationRoot from './libs/Navigation/NavigationRoot';
import NetworkConnection from './libs/NetworkConnection';
import PushNotification from './libs/Notification/PushNotification';
import './libs/Notification/PushNotification/subscribeToPushNotifications';
import setCrashlyticsUserId from './libs/setCrashlyticsUserId';
import StartupTimer from './libs/StartupTimer';
// This lib needs to be imported, but it has nothing to export since all it contains is an Onyx connection
import './libs/UnreadIndicatorUpdater';
import Visibility from './libs/Visibility';
import ONYXKEYS from './ONYXKEYS';
import PopoverReportActionContextMenu from './pages/home/report/ContextMenu/PopoverReportActionContextMenu';
import * as ReportActionContextMenu from './pages/home/report/ContextMenu/ReportActionContextMenu';
import type {Route} from './ROUTES';
import SplashScreenStateContext from './SplashScreenStateContext';
import type {ScreenShareRequest} from './types/onyx';

Onyx.registerLogger(({level, message, parameters}) => {
    if (level === 'alert') {
        Log.alert(message, parameters);
        console.error(message);

        // useOnyx() calls with "canBeMissing" config set to false will display a visual alert in dev environment
        // when they don't return data.
        const shouldShowAlert = typeof parameters === 'object' && !Array.isArray(parameters) && 'showAlert' in parameters && 'key' in parameters;
        if (Environment.isDevelopment() && shouldShowAlert) {
            Growl.error(`${message} Key: ${parameters.key as string}`, 10000);
        }
    } else if (level === 'hmmm') {
        Log.hmmm(message, parameters);
    } else {
        Log.info(message, undefined, parameters);
    }
});

type ExpensifyProps = {
    /** Whether the app is waiting for the server's response to determine if a room is public */
    isCheckingPublicRoom: OnyxEntry<boolean>;

    /** Whether a new update is available and ready to install. */
    updateAvailable: OnyxEntry<boolean>;

    /** Tells us if the sidebar has rendered */
    isSidebarLoaded: OnyxEntry<boolean>;

    /** Information about a screen share call requested by a GuidesPlus agent */
    screenShareRequest: OnyxEntry<ScreenShareRequest>;

    /** True when the user must update to the latest minimum version of the app */
    updateRequired: OnyxEntry<boolean>;

    /** Last visited path in the app */
    lastVisitedPath: OnyxEntry<string | undefined>;
};
function Expensify() {
    const appStateChangeListener = useRef<NativeEventSubscription | null>(null);
    const [isNavigationReady, setIsNavigationReady] = useState(false);
    const [isOnyxMigrated, setIsOnyxMigrated] = useState(false);
    const {splashScreenState, setSplashScreenState} = useContext(SplashScreenStateContext);
    const [hasAttemptedToOpenPublicRoom, setAttemptedToOpenPublicRoom] = useState(false);
    const {translate, preferredLocale} = useLocalize();
    const [account] = useOnyx(ONYXKEYS.ACCOUNT, {canBeMissing: true});
    const [session] = useOnyx(ONYXKEYS.SESSION, {canBeMissing: true});
    const [lastRoute] = useOnyx(ONYXKEYS.LAST_ROUTE, {canBeMissing: true});
    const [userMetadata] = useOnyx(ONYXKEYS.USER_METADATA, {canBeMissing: true});
    const [isCheckingPublicRoom = true] = useOnyx(ONYXKEYS.IS_CHECKING_PUBLIC_ROOM, {initWithStoredValues: false, canBeMissing: true});
    const [updateAvailable] = useOnyx(ONYXKEYS.UPDATE_AVAILABLE, {initWithStoredValues: false, canBeMissing: true});
    const [updateRequired] = useOnyx(ONYXKEYS.UPDATE_REQUIRED, {initWithStoredValues: false, canBeMissing: true});
    const [isSidebarLoaded] = useOnyx(ONYXKEYS.IS_SIDEBAR_LOADED, {canBeMissing: true});
    const [screenShareRequest] = useOnyx(ONYXKEYS.SCREEN_SHARE_REQUEST, {canBeMissing: true});
    const [lastVisitedPath] = useOnyx(ONYXKEYS.LAST_VISITED_PATH, {canBeMissing: true});
    const [currentOnboardingPurposeSelected] = useOnyx(ONYXKEYS.ONBOARDING_PURPOSE_SELECTED, {canBeMissing: true});
    const [currentOnboardingCompanySize] = useOnyx(ONYXKEYS.ONBOARDING_COMPANY_SIZE, {canBeMissing: true});
    const [onboardingInitialPath] = useOnyx(ONYXKEYS.ONBOARDING_LAST_VISITED_PATH, {canBeMissing: true});
    const [hybridApp] = useOnyx(ONYXKEYS.HYBRID_APP, {canBeMissing: true});

    useDebugShortcut();
    usePriorityMode();

    const [initialUrl, setInitialUrl] = useState<Route | null>(null);

    useEffect(() => {
        if (isCheckingPublicRoom) {
            return;
        }
        setAttemptedToOpenPublicRoom(true);
    }, [isCheckingPublicRoom]);

    const isAuthenticated = useIsAuthenticated();
    const autoAuthState = useMemo(() => session?.autoAuthState ?? '', [session]);

    const isSplashReadyToBeHidden = splashScreenState === CONST.BOOT_SPLASH_STATE.READY_TO_BE_HIDDEN;
    const isSplashVisible = splashScreenState === CONST.BOOT_SPLASH_STATE.VISIBLE;

    const shouldInit = isNavigationReady && hasAttemptedToOpenPublicRoom && !!preferredLocale;
    const shouldHideSplash = (isSplashReadyToBeHidden || isSplashVisible) && shouldInit && !hybridApp?.loggedOutFromOldDot;

    // This effect is closing OldDot sign out modal based on splash screen state
    useEffect(() => {
        if (!isSplashReadyToBeHidden || !shouldInit || !hybridApp?.loggedOutFromOldDot) {
            return;
        }

        setSplashScreenState(CONST.BOOT_SPLASH_STATE.HIDDEN);
        HybridAppModule.clearOldDotAfterSignOut();
    }, [hybridApp?.loggedOutFromOldDot, isSplashReadyToBeHidden, setSplashScreenState, shouldInit, splashScreenState]);

    const initializeClient = () => {
        if (!Visibility.isVisible()) {
            return;
        }

        // Delay client init to avoid issues with delayed Onyx events on iOS. All iOS browsers use WebKit, which suspends events in background tabs.
        // Events are flushed only when the tab becomes active again causing issues with client initialization.
        // See: https://stackoverflow.com/questions/54095584/page-becomes-inactive-when-switching-tabs-on-ios
        if (isSafari()) {
            setTimeout(ActiveClientManager.init, 400);
        } else {
            ActiveClientManager.init();
        }
    };

    const setNavigationReady = useCallback(() => {
        setIsNavigationReady(true);

        // Navigate to any pending routes now that the NavigationContainer is ready
        Navigation.setIsNavigationReady();
    }, []);

    const onSplashHide = useCallback(() => {
        setSplashScreenState(CONST.BOOT_SPLASH_STATE.HIDDEN);
    }, [setSplashScreenState]);

    useLayoutEffect(() => {
        // Initialize this client as being an active client
        ActiveClientManager.init();

        // Used for the offline indicator appearing when someone is offline
        const unsubscribeNetInfo = NetworkConnection.subscribeToNetInfo();

        return unsubscribeNetInfo;
    }, []);

    useEffect(() => {
        // Initialize Fullstory lib
        FS.init(userMetadata);
    }, [userMetadata]);

    // Log the platform and config to debug .env issues
    useEffect(() => {
        Log.info('App launched', false, {Platform, CONFIG});
    }, []);

    useEffect(() => {
        setTimeout(() => {
            const appState = AppState.currentState;
            Log.info('[BootSplash] splash screen status', false, {appState, splashScreenState});

            if (splashScreenState === CONST.BOOT_SPLASH_STATE.VISIBLE) {
                const propsToLog: Omit<ExpensifyProps & {isAuthenticated: boolean}, 'children' | 'session'> = {
                    isCheckingPublicRoom,
                    updateRequired,
                    updateAvailable,
                    isSidebarLoaded,
                    screenShareRequest,
                    isAuthenticated,
                    lastVisitedPath,
                };
                Log.alert('[BootSplash] splash screen is still visible', {propsToLog}, false);
            }
        }, 30 * 1000);

        // This timer is set in the native layer when launching the app and we stop it here so we can measure how long
        // it took for the main app itself to load.
        StartupTimer.stop();

        // Run any Onyx schema migrations and then continue loading the main app
        migrateOnyx().then(() => {
            // In case of a crash that led to disconnection, we want to remove all the push notifications.
            if (!isAuthenticated) {
                PushNotification.clearNotifications();
            }

            setIsOnyxMigrated(true);
        });

        appStateChangeListener.current = AppState.addEventListener('change', initializeClient);

        // If the app is opened from a deep link, get the reportID (if exists) from the deep link and navigate to the chat report
        Linking.getInitialURL().then((url) => {
            setInitialUrl(url as Route);
            Report.openReportFromDeepLink(url ?? '', currentOnboardingPurposeSelected, currentOnboardingCompanySize, onboardingInitialPath);
        });

        // Open chat report from a deep link (only mobile native)
        Linking.addEventListener('url', (state) => {
            Report.openReportFromDeepLink(state.url, currentOnboardingPurposeSelected, currentOnboardingCompanySize, onboardingInitialPath);
        });
        if (CONFIG.IS_HYBRID_APP) {
            HybridAppModule.onURLListenerAdded();
        }

        return () => {
            if (!appStateChangeListener.current) {
                return;
            }
            appStateChangeListener.current.remove();
        };
        // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps -- we don't want this effect to run again
    }, []);

    // This is being done since we want to play sound even when iOS device is on silent mode, to align with other platforms.
    useEffect(() => {
        Audio.setAudioModeAsync({playsInSilentModeIOS: true});
    }, []);

    useLayoutEffect(() => {
        if (!isNavigationReady || !lastRoute) {
            return;
        }
        updateLastRoute('');
        Navigation.navigate(lastRoute as Route);
        // Disabling this rule because we only want it to run on the first render.
        // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps
    }, [isNavigationReady]);

    useEffect(() => {
        if (!isAuthenticated) {
            return;
        }
        setCrashlyticsUserId(session?.accountID ?? CONST.DEFAULT_NUMBER_ID);
    }, [isAuthenticated, session?.accountID]);

    useEffect(() => {
        if (!account?.delegatedAccess?.delegate) {
            return;
        }
        if (account?.delegatedAccess?.delegates?.some((d) => d.email === account?.delegatedAccess?.delegate)) {
            return;
        }
        disconnect();
    }, [account?.delegatedAccess?.delegates, account?.delegatedAccess?.delegate]);

    // Display a blank page until the onyx migration completes
    if (!isOnyxMigrated) {
        return null;
    }

    if (updateRequired) {
        throw new Error(CONST.ERROR.UPDATE_REQUIRED);
    }

    return (
        <DeeplinkWrapper
            isAuthenticated={isAuthenticated}
            autoAuthState={autoAuthState}
            initialUrl={initialUrl ?? ''}
        >
            {shouldInit && (
                <>
                    <GrowlNotification ref={growlRef} />
                    <PopoverReportActionContextMenu ref={ReportActionContextMenu.contextMenuRef} />
                    <EmojiPicker ref={EmojiPickerAction.emojiPickerRef} />
                    {/* We include the modal for showing a new update at the top level so the option is always present. */}
                    {updateAvailable && !updateRequired ? <UpdateAppModal /> : null}
                    {screenShareRequest ? (
                        <ConfirmModal
                            title={translate('guides.screenShare')}
                            onConfirm={() => User.joinScreenShare(screenShareRequest.accessToken, screenShareRequest.roomName)}
                            onCancel={User.clearScreenShareRequest}
                            prompt={translate('guides.screenShareRequest')}
                            confirmText={translate('common.join')}
                            cancelText={translate('common.decline')}
                            isVisible
                        />
                    ) : null}
                </>
            )}

            <AppleAuthWrapper />
            {hasAttemptedToOpenPublicRoom && (
                <NavigationRoot
                    onReady={setNavigationReady}
                    authenticated={isAuthenticated}
                    lastVisitedPath={lastVisitedPath as Route}
                    initialUrl={initialUrl}
                />
            )}
            {shouldHideSplash && <SplashScreenHider onHide={onSplashHide} />}
        </DeeplinkWrapper>
    );
}

Expensify.displayName = 'Expensify';

export default Expensify;

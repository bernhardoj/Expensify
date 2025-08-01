import type {RefObject} from 'react';
import React, {useContext, useMemo, useRef, useState} from 'react';
import type {View} from 'react-native';
import type {OnyxEntry} from 'react-native-onyx';
import AccountingConnectionConfirmationModal from '@components/AccountingConnectionConfirmationModal';
import useLocalize from '@hooks/useLocalize';
import useResponsiveLayout from '@hooks/useResponsiveLayout';
import {removePolicyConnection} from '@libs/actions/connections';
import Navigation from '@libs/Navigation/Navigation';
import {isControlPolicy} from '@libs/PolicyUtils';
import CONST from '@src/CONST';
import ROUTES from '@src/ROUTES';
import type {ConnectionName} from '@src/types/onyx/Policy';
import type Policy from '@src/types/onyx/Policy';
import type ChildrenProps from '@src/types/utils/ChildrenProps';
import {getAccountingIntegrationData} from './utils';

type ActiveIntegration = {
    name: ConnectionName;
    shouldDisconnectIntegrationBeforeConnecting?: boolean;
    integrationToDisconnect?: ConnectionName;
};

type ActiveIntegrationState = ActiveIntegration & {key: number};

type AccountingContextType = {
    activeIntegration?: ActiveIntegration;
    startIntegrationFlow: (activeIntegration: ActiveIntegration) => void;

    /*
     * This stores refs to integration buttons, so the PopoverMenu can be positioned correctly
     */
    popoverAnchorRefs: RefObject<Record<string, RefObject<View | null>>>;
};

const popoverAnchorRefsInitialValue = Object.values(CONST.POLICY.CONNECTIONS.NAME).reduce(
    (acc, key) => {
        acc[key] = {current: null};
        return acc;
    },
    {} as Record<ConnectionName, RefObject<View | null>>,
);

const defaultAccountingContext = {
    activeIntegration: undefined,
    startIntegrationFlow: () => {},
    popoverAnchorRefs: {
        current: popoverAnchorRefsInitialValue,
    },
};

const AccountingContext = React.createContext<AccountingContextType>(defaultAccountingContext);

type AccountingContextProviderProps = ChildrenProps & {
    policy: OnyxEntry<Policy>;
};

function AccountingContextProvider({children, policy}: AccountingContextProviderProps) {
    const popoverAnchorRefs = useRef<Record<string, RefObject<View | null>>>(defaultAccountingContext.popoverAnchorRefs.current);
    const [activeIntegration, setActiveIntegration] = useState<ActiveIntegrationState>();
    const {translate} = useLocalize();
    const policyID = policy?.id;

    // We need to use isSmallScreenWidth instead of shouldUseNarrowLayout to allow QuickBooks Desktop setup to be shown only on large screens
    // eslint-disable-next-line rulesdir/prefer-shouldUseNarrowLayout-instead-of-isSmallScreenWidth
    const {isSmallScreenWidth} = useResponsiveLayout();

    const startIntegrationFlow = React.useCallback(
        (newActiveIntegration: ActiveIntegration) => {
            if (!policyID) {
                return;
            }

            const accountingIntegrationData = getAccountingIntegrationData(
                newActiveIntegration.name,
                policyID,
                translate,
                undefined,
                undefined,
                newActiveIntegration.integrationToDisconnect,
                newActiveIntegration.shouldDisconnectIntegrationBeforeConnecting,
                undefined,
                isSmallScreenWidth,
            );
            const workspaceUpgradeNavigationDetails = accountingIntegrationData?.workspaceUpgradeNavigationDetails;
            if (workspaceUpgradeNavigationDetails && !isControlPolicy(policy)) {
                Navigation.navigate(
                    ROUTES.WORKSPACE_UPGRADE.getRoute(policyID, workspaceUpgradeNavigationDetails.integrationAlias, workspaceUpgradeNavigationDetails.backToAfterWorkspaceUpgradeRoute),
                );
                return;
            }
            setActiveIntegration({
                ...newActiveIntegration,
                key: Math.random(),
            });
        },
        [isSmallScreenWidth, policy, policyID, translate],
    );

    const closeConfirmationModal = () => {
        setActiveIntegration((prev) => {
            if (prev) {
                return {
                    ...prev,
                    shouldDisconnectIntegrationBeforeConnecting: false,
                    integrationToDisconnect: undefined,
                };
            }
            return undefined;
        });
    };

    const accountingContext = useMemo(
        () => ({
            activeIntegration,
            startIntegrationFlow,
            popoverAnchorRefs,
        }),
        [activeIntegration, startIntegrationFlow],
    );

    const renderActiveIntegration = () => {
        if (!policyID || !activeIntegration) {
            return null;
        }

        return getAccountingIntegrationData(activeIntegration.name, policyID, translate, policy, activeIntegration.key)?.setupConnectionFlow;
    };

    const shouldShowConfirmationModal = !!activeIntegration?.shouldDisconnectIntegrationBeforeConnecting && !!activeIntegration?.integrationToDisconnect;

    return (
        <AccountingContext.Provider value={accountingContext}>
            {children}
            {!shouldShowConfirmationModal && renderActiveIntegration()}
            {shouldShowConfirmationModal && (
                <AccountingConnectionConfirmationModal
                    onConfirm={() => {
                        if (!policyID || !activeIntegration?.integrationToDisconnect) {
                            return;
                        }
                        removePolicyConnection(policy, activeIntegration?.integrationToDisconnect);
                        closeConfirmationModal();
                    }}
                    integrationToConnect={activeIntegration?.name}
                    onCancel={() => {
                        setActiveIntegration(undefined);
                    }}
                />
            )}
        </AccountingContext.Provider>
    );
}

function useAccountingContext() {
    return useContext(AccountingContext);
}

export default AccountingContext;
export {AccountingContextProvider, useAccountingContext};

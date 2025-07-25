import React, {useCallback, useMemo, useState} from 'react';
import type {SectionListData} from 'react-native';
import type {OnyxEntry} from 'react-native-onyx';
import Badge from '@components/Badge';
import FullPageNotFoundView from '@components/BlockingViews/FullPageNotFoundView';
import HeaderWithBackButton from '@components/HeaderWithBackButton';
import {FallbackAvatar} from '@components/Icon/Expensicons';
import ScreenWrapper from '@components/ScreenWrapper';
import SelectionList from '@components/SelectionList';
import type {ListItem, Section} from '@components/SelectionList/types';
import UserListItem from '@components/SelectionList/UserListItem';
import useLocalize from '@hooks/useLocalize';
import useNetwork from '@hooks/useNetwork';
import Log from '@libs/Log';
import Navigation from '@libs/Navigation/Navigation';
import type {PlatformStackScreenProps} from '@libs/Navigation/PlatformStackNavigation/types';
import {getSearchValueForPhoneOrEmail} from '@libs/OptionsListUtils';
import {getDisplayNameOrDefault} from '@libs/PersonalDetailsUtils';
import {getMemberAccountIDsForWorkspace, goBackFromInvalidPolicy, isExpensifyTeam, isPendingDeletePolicy} from '@libs/PolicyUtils';
import tokenizedSearch from '@libs/tokenizedSearch';
import type {SettingsNavigatorParamList} from '@navigation/types';
import AccessOrNotFoundWrapper from '@pages/workspace/AccessOrNotFoundWrapper';
import withPolicyAndFullscreenLoading from '@pages/workspace/withPolicyAndFullscreenLoading';
import type {WithPolicyAndFullscreenLoadingProps} from '@pages/workspace/withPolicyAndFullscreenLoading';
import {setWorkspacePayer} from '@userActions/Policy/Policy';
import CONST from '@src/CONST';
import type SCREENS from '@src/SCREENS';
import type {PersonalDetailsList, PolicyEmployee} from '@src/types/onyx';
import {isEmptyObject} from '@src/types/utils/EmptyObject';

type WorkspaceWorkflowsPayerPageOnyxProps = {
    /** All of the personal details for everyone */
    personalDetails: OnyxEntry<PersonalDetailsList>;
};

type WorkspaceWorkflowsPayerPageProps = WorkspaceWorkflowsPayerPageOnyxProps &
    WithPolicyAndFullscreenLoadingProps &
    PlatformStackScreenProps<SettingsNavigatorParamList, typeof SCREENS.WORKSPACE.WORKFLOWS_PAYER>;
type MemberOption = Omit<ListItem, 'accountID'> & {accountID: number};
type MembersSection = SectionListData<MemberOption, Section<MemberOption>>;

function WorkspaceWorkflowsPayerPage({route, policy, personalDetails, isLoadingReportData = true}: WorkspaceWorkflowsPayerPageProps) {
    const {translate, formatPhoneNumber} = useLocalize();
    const policyName = policy?.name ?? '';
    const {isOffline} = useNetwork();

    const [searchTerm, setSearchTerm] = useState('');

    const isDeletedPolicyEmployee = useCallback(
        (policyEmployee: PolicyEmployee) => !isOffline && policyEmployee.pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE && isEmptyObject(policyEmployee.errors),
        [isOffline],
    );

    const [formattedPolicyAdmins, formattedAuthorizedPayer] = useMemo(() => {
        const policyAdminDetails: MemberOption[] = [];
        const authorizedPayerDetails: MemberOption[] = [];

        const policyMemberEmailsToAccountIDs = getMemberAccountIDsForWorkspace(policy?.employeeList);

        Object.entries(policy?.employeeList ?? {}).forEach(([email, policyEmployee]) => {
            const accountID = policyMemberEmailsToAccountIDs?.[email] ?? '';
            const details = personalDetails?.[accountID];
            if (!details) {
                Log.hmmm(`[WorkspaceMembersPage] no personal details found for policy member with accountID: ${accountID}`);
                return;
            }

            const isOwner = policy?.owner === details?.login;
            const isAdmin = policyEmployee.role === CONST.POLICY.ROLE.ADMIN;
            const shouldSkipMember = isDeletedPolicyEmployee(policyEmployee) || isExpensifyTeam(details?.login) || (!isOwner && !isAdmin);

            if (shouldSkipMember) {
                return;
            }

            const roleBadge = <Badge text={isOwner ? translate('common.owner') : translate('common.admin')} />;

            const isAuthorizedPayer = policy?.achAccount?.reimburser === details?.login;

            const formattedMember = {
                keyForList: String(accountID),
                accountID,
                isSelected: isAuthorizedPayer,
                isDisabled: policyEmployee.pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE || !isEmptyObject(policyEmployee.errors),
                text: formatPhoneNumber(getDisplayNameOrDefault(details)),
                alternateText: formatPhoneNumber(details?.login ?? ''),
                rightElement: roleBadge,
                icons: [
                    {
                        source: details.avatar ?? FallbackAvatar,
                        name: formatPhoneNumber(details?.login ?? ''),
                        type: CONST.ICON_TYPE_AVATAR,
                        id: accountID,
                    },
                ],
                errors: policyEmployee.errors,
                pendingAction: (policyEmployee.pendingAction ?? isAuthorizedPayer) ? policy?.pendingFields?.reimburser : null,
            };

            if (isAuthorizedPayer) {
                authorizedPayerDetails.push(formattedMember);
            } else {
                policyAdminDetails.push(formattedMember);
            }
        });
        return [policyAdminDetails, authorizedPayerDetails];
    }, [personalDetails, policy?.employeeList, translate, policy?.achAccount?.reimburser, isDeletedPolicyEmployee, policy?.owner, policy?.pendingFields?.reimburser, formatPhoneNumber]);

    const sections: MembersSection[] = useMemo(() => {
        const sectionsArray: MembersSection[] = [];

        if (searchTerm !== '') {
            const searchValue = getSearchValueForPhoneOrEmail(searchTerm);
            const filteredOptions = tokenizedSearch([...formattedPolicyAdmins, ...formattedAuthorizedPayer], searchValue, (option) => [option.text ?? '', option.login ?? '']);

            return [
                {
                    title: undefined,
                    data: filteredOptions,
                    shouldShow: true,
                },
            ];
        }

        sectionsArray.push({
            data: formattedAuthorizedPayer,
            shouldShow: true,
        });

        sectionsArray.push({
            title: translate('workflowsPayerPage.admins'),
            data: formattedPolicyAdmins,
            shouldShow: true,
        });
        return sectionsArray;
    }, [formattedPolicyAdmins, formattedAuthorizedPayer, translate, searchTerm]);

    const headerMessage = useMemo(
        () => (searchTerm && !sections.at(0)?.data.length ? translate('common.noResultsFound') : ''),

        // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps
        [translate, sections],
    );

    const setPolicyAuthorizedPayer = (member: MemberOption) => {
        const authorizedPayerEmail = personalDetails?.[member.accountID]?.login ?? '';

        if (policy?.achAccount?.reimburser === authorizedPayerEmail || policy?.reimbursementChoice !== CONST.POLICY.REIMBURSEMENT_CHOICES.REIMBURSEMENT_YES) {
            Navigation.goBack();
            return;
        }

        setWorkspacePayer(policy?.id, authorizedPayerEmail);
        Navigation.goBack();
    };

    // eslint-disable-next-line rulesdir/no-negated-variables
    const shouldShowNotFoundPage = useMemo(
        () => (isEmptyObject(policy) && !isLoadingReportData) || isPendingDeletePolicy(policy) || policy?.reimbursementChoice !== CONST.POLICY.REIMBURSEMENT_CHOICES.REIMBURSEMENT_YES,
        [policy, isLoadingReportData],
    );

    return (
        <AccessOrNotFoundWrapper
            accessVariants={[CONST.POLICY.ACCESS_VARIANTS.ADMIN, CONST.POLICY.ACCESS_VARIANTS.PAID]}
            policyID={route.params.policyID}
        >
            <FullPageNotFoundView
                shouldShow={shouldShowNotFoundPage}
                subtitleKey={isEmptyObject(policy) ? undefined : 'workspace.common.notAuthorized'}
                onBackButtonPress={goBackFromInvalidPolicy}
                onLinkPress={goBackFromInvalidPolicy}
            >
                <ScreenWrapper
                    enableEdgeToEdgeBottomSafeAreaPadding
                    testID={WorkspaceWorkflowsPayerPage.displayName}
                >
                    <HeaderWithBackButton
                        title={translate('workflowsPayerPage.title')}
                        subtitle={policyName}
                        onBackButtonPress={Navigation.goBack}
                    />
                    <SelectionList
                        sections={sections}
                        textInputLabel={translate('selectionList.findMember')}
                        textInputValue={searchTerm}
                        onChangeText={setSearchTerm}
                        headerMessage={headerMessage}
                        ListItem={UserListItem}
                        onSelectRow={setPolicyAuthorizedPayer}
                        shouldSingleExecuteRowSelect
                        showScrollIndicator
                        addBottomSafeAreaPadding
                    />
                </ScreenWrapper>
            </FullPageNotFoundView>
        </AccessOrNotFoundWrapper>
    );
}

WorkspaceWorkflowsPayerPage.displayName = 'WorkspaceWorkflowsPayerPage';

export default withPolicyAndFullscreenLoading(WorkspaceWorkflowsPayerPage);

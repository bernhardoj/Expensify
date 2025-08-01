import {Str} from 'expensify-common';
import type {RefObject} from 'react';
import React from 'react';
// eslint-disable-next-line no-restricted-imports
import type {GestureResponderEvent, Text, View} from 'react-native';
import type {OnyxEntry} from 'react-native-onyx';
import type {Emoji} from '@assets/emojis/types';
import * as Expensicons from '@components/Icon/Expensicons';
import MiniQuickEmojiReactions from '@components/Reactions/MiniQuickEmojiReactions';
import QuickEmojiReactions from '@components/Reactions/QuickEmojiReactions';
import addEncryptedAuthTokenToURL from '@libs/addEncryptedAuthTokenToURL';
import {isMobileSafari} from '@libs/Browser';
import Clipboard from '@libs/Clipboard';
import EmailUtils from '@libs/EmailUtils';
import {getEnvironmentURL} from '@libs/Environment/Environment';
import fileDownload from '@libs/fileDownload';
import getAttachmentDetails from '@libs/fileDownload/getAttachmentDetails';
import {translateLocal} from '@libs/Localize';
import ModifiedExpenseMessage from '@libs/ModifiedExpenseMessage';
import Navigation from '@libs/Navigation/Navigation';
import Parser from '@libs/Parser';
import {getCleanedTagName} from '@libs/PolicyUtils';
import ReportActionComposeFocusManager from '@libs/ReportActionComposeFocusManager';
import {
    getActionableMentionWhisperMessage,
    getAddedApprovalRuleMessage,
    getAddedConnectionMessage,
    getCardIssuedMessage,
    getDeletedApprovalRuleMessage,
    getExportIntegrationMessageHTML,
    getIntegrationSyncFailedMessage,
    getIOUReportIDFromReportActionPreview,
    getJoinRequestMessage,
    getMemberChangeMessageFragment,
    getMessageOfOldDotReportAction,
    getOriginalMessage,
    getPolicyChangeLogAddEmployeeMessage,
    getPolicyChangeLogDefaultBillableMessage,
    getPolicyChangeLogDefaultTitleEnforcedMessage,
    getPolicyChangeLogDeleteMemberMessage,
    getPolicyChangeLogMaxExpenseAmountMessage,
    getPolicyChangeLogMaxExpenseAmountNoReceiptMessage,
    getPolicyChangeLogUpdateEmployee,
    getRemovedConnectionMessage,
    getRenamedAction,
    getReopenedMessage,
    getReportActionMessageText,
    getTagListNameUpdatedMessage,
    getTravelUpdateMessage,
    getUpdatedApprovalRuleMessage,
    getUpdatedAuditRateMessage,
    getUpdatedManualApprovalThresholdMessage,
    getUpdateRoomDescriptionMessage,
    getWorkspaceCategoryUpdateMessage,
    getWorkspaceCurrencyUpdateMessage,
    getWorkspaceCustomUnitRateAddedMessage,
    getWorkspaceCustomUnitRateDeletedMessage,
    getWorkspaceCustomUnitRateUpdatedMessage,
    getWorkspaceCustomUnitUpdatedMessage,
    getWorkspaceDescriptionUpdatedMessage,
    getWorkspaceFrequencyUpdateMessage,
    getWorkspaceReportFieldAddMessage,
    getWorkspaceReportFieldDeleteMessage,
    getWorkspaceReportFieldUpdateMessage,
    getWorkspaceTagUpdateMessage,
    getWorkspaceUpdateFieldMessage,
    isActionableJoinRequest,
    isActionableMentionWhisper,
    isActionableTrackExpense,
    isActionOfType,
    isCardIssuedAction,
    isCreatedTaskReportAction,
    isDeletedAction as isDeletedActionReportActionsUtils,
    isMarkAsClosedAction,
    isMemberChangeAction,
    isMessageDeleted,
    isModifiedExpenseAction,
    isMoneyRequestAction,
    isOldDotReportAction,
    isReimbursementDeQueuedOrCanceledAction,
    isReimbursementQueuedAction,
    isRenamedAction,
    isReportActionAttachment,
    isReportPreviewAction as isReportPreviewActionReportActionsUtils,
    isTagModificationAction,
    isTaskAction as isTaskActionReportActionsUtils,
    isTripPreview,
    isUnapprovedAction,
    isWhisperAction as isWhisperActionReportActionsUtils,
} from '@libs/ReportActionsUtils';
import {
    canDeleteReportAction,
    canEditReportAction,
    canFlagReportAction,
    canHoldUnholdReportAction,
    changeMoneyRequestHoldStatus,
    getChildReportNotificationPreference as getChildReportNotificationPreferenceReportUtils,
    getDeletedTransactionMessage,
    getDowngradeWorkspaceMessage,
    getIOUReportActionDisplayMessage,
    getOriginalReportID,
    getPolicyChangeMessage,
    getReimbursementDeQueuedOrCanceledActionMessage,
    getReimbursementQueuedActionMessage,
    getRejectedReportMessage,
    getReportName,
    getReportPreviewMessage,
    getUpgradeWorkspaceMessage,
    getWorkspaceNameUpdatedMessage,
    isExpenseReport,
    shouldDisableThread,
    shouldDisplayThreadReplies as shouldDisplayThreadRepliesReportUtils,
} from '@libs/ReportUtils';
import {getTaskCreatedMessage, getTaskReportActionMessage} from '@libs/TaskUtils';
import {setDownload} from '@userActions/Download';
import {
    deleteReportActionDraft,
    markCommentAsUnread,
    navigateToAndOpenChildReport,
    openReport,
    readNewestAction,
    saveReportActionDraft,
    toggleEmojiReaction,
    togglePinnedState,
    toggleSubscribeToChildReport,
} from '@userActions/Report';
import CONST from '@src/CONST';
import type {TranslationPaths} from '@src/languages/types';
import ROUTES from '@src/ROUTES';
import type {Account, Beta, Card, Download as DownloadOnyx, OnyxInputOrEntry, ReportAction, ReportActionReactions, Report as ReportType, Transaction} from '@src/types/onyx';
import type IconAsset from '@src/types/utils/IconAsset';
import KeyboardUtils from '@src/utils/keyboard';
import type {ContextMenuAnchor} from './ReportActionContextMenu';
import {hideContextMenu, showDeleteModal} from './ReportActionContextMenu';

/** Gets the HTML version of the message in an action */
function getActionHtml(reportAction: OnyxInputOrEntry<ReportAction>): string {
    const message = Array.isArray(reportAction?.message) ? (reportAction?.message?.at(-1) ?? null) : (reportAction?.message ?? null);
    return message?.html ?? '';
}

/** Sets the HTML string to Clipboard */
function setClipboardMessage(content: string | undefined) {
    if (!content) {
        return;
    }
    if (!Clipboard.canSetHtml()) {
        Clipboard.setString(Parser.htmlToMarkdown(content));
    } else {
        // Use markdown format text for the plain text(clipboard type "text/plain") to ensure consistency across all platforms.
        // More info: https://github.com/Expensify/App/issues/53718
        const markdownText = Parser.htmlToMarkdown(content);
        Clipboard.setHtml(content, markdownText);
    }
}

type ShouldShow = (args: {
    type: string;
    reportAction: OnyxEntry<ReportAction>;
    isArchivedRoom: boolean;
    betas: OnyxEntry<Beta[]>;
    menuTarget: RefObject<ContextMenuAnchor> | undefined;
    isChronosReport: boolean;
    reportID?: string;
    isPinnedChat: boolean;
    isUnreadChat: boolean;
    isThreadReportParentAction: boolean;
    isOffline: boolean;
    isMini: boolean;
    isProduction: boolean;
    moneyRequestAction: ReportAction | undefined;
    areHoldRequirementsMet: boolean;
    account: OnyxEntry<Account>;
    iouTransaction: OnyxEntry<Transaction>;
}) => boolean;

type ContextMenuActionPayload = {
    reportAction: ReportAction;
    transaction?: OnyxEntry<Transaction>;
    reportID: string | undefined;
    report: OnyxEntry<ReportType>;
    draftMessage: string;
    selection: string;
    close: () => void;
    transitionActionSheetState: (params: {type: string; payload?: Record<string, unknown>}) => void;
    openContextMenu: () => void;
    interceptAnonymousUser: (callback: () => void, isAnonymousAction?: boolean) => void;
    anchor?: RefObject<HTMLDivElement | View | Text | null>;
    checkIfContextMenuActive?: () => void;
    openOverflowMenu: (event: GestureResponderEvent | MouseEvent, anchorRef: RefObject<View | null>) => void;
    event?: GestureResponderEvent | MouseEvent | KeyboardEvent;
    setIsEmojiPickerActive?: (state: boolean) => void;
    anchorRef?: RefObject<View | null>;
    moneyRequestAction: ReportAction | undefined;
    card?: Card;
};

type OnPress = (closePopover: boolean, payload: ContextMenuActionPayload, selection?: string, reportID?: string, draftMessage?: string) => void;

type RenderContent = (closePopover: boolean, payload: ContextMenuActionPayload) => React.ReactElement;

type GetDescription = (selection?: string) => string | void;

type ContextMenuActionWithContent = {
    renderContent: RenderContent;
};

type ContextMenuActionWithIcon = {
    textTranslateKey: TranslationPaths;
    icon: IconAsset;
    successTextTranslateKey?: TranslationPaths;
    successIcon?: IconAsset;
    onPress: OnPress;
    getDescription: GetDescription;
};

type ContextMenuAction = (ContextMenuActionWithContent | ContextMenuActionWithIcon) & {
    isAnonymousAction: boolean;
    shouldShow: ShouldShow;
    shouldPreventDefaultFocusOnPress?: boolean;
    shouldDisable?: (download: OnyxEntry<DownloadOnyx>) => boolean;
};

// A list of all the context actions in this menu.
const ContextMenuActions: ContextMenuAction[] = [
    {
        isAnonymousAction: false,
        shouldShow: ({type, reportAction}) => type === CONST.CONTEXT_MENU_TYPES.REPORT_ACTION && !!reportAction && 'message' in reportAction && !isMessageDeleted(reportAction),
        renderContent: (closePopover, {reportID, reportAction, close: closeManually, openContextMenu, setIsEmojiPickerActive}) => {
            const isMini = !closePopover;

            const closeContextMenu = (onHideCallback?: () => void) => {
                if (isMini) {
                    closeManually();
                    if (onHideCallback) {
                        onHideCallback();
                    }
                } else {
                    hideContextMenu(false, onHideCallback);
                }
            };

            const toggleEmojiAndCloseMenu = (emoji: Emoji, existingReactions: OnyxEntry<ReportActionReactions>) => {
                toggleEmojiReaction(reportID, reportAction, emoji, existingReactions);
                closeContextMenu();
                setIsEmojiPickerActive?.(false);
            };

            if (isMini) {
                return (
                    <MiniQuickEmojiReactions
                        key="MiniQuickEmojiReactions"
                        onEmojiSelected={toggleEmojiAndCloseMenu}
                        onPressOpenPicker={() => {
                            openContextMenu();
                            setIsEmojiPickerActive?.(true);
                        }}
                        onEmojiPickerClosed={() => {
                            closeContextMenu();
                            setIsEmojiPickerActive?.(false);
                        }}
                        reportActionID={reportAction?.reportActionID}
                        reportAction={reportAction}
                    />
                );
            }

            return (
                <QuickEmojiReactions
                    key="BaseQuickEmojiReactions"
                    closeContextMenu={closeContextMenu}
                    onEmojiSelected={toggleEmojiAndCloseMenu}
                    reportActionID={reportAction?.reportActionID}
                    reportAction={reportAction}
                    setIsEmojiPickerActive={setIsEmojiPickerActive}
                />
            );
        },
    },
    {
        isAnonymousAction: false,
        textTranslateKey: 'reportActionContextMenu.replyInThread',
        icon: Expensicons.ChatBubbleReply,
        shouldShow: ({type, reportAction, reportID, isThreadReportParentAction, isArchivedRoom}) => {
            if (type !== CONST.CONTEXT_MENU_TYPES.REPORT_ACTION || !reportID) {
                return false;
            }
            return !shouldDisableThread(reportAction, reportID, isThreadReportParentAction, isArchivedRoom);
        },
        onPress: (closePopover, {reportAction, reportID}) => {
            const originalReportID = getOriginalReportID(reportID, reportAction);
            if (closePopover) {
                hideContextMenu(false, () => {
                    KeyboardUtils.dismiss().then(() => {
                        navigateToAndOpenChildReport(reportAction?.childReportID, reportAction, originalReportID);
                    });
                });
                return;
            }
            navigateToAndOpenChildReport(reportAction?.childReportID, reportAction, originalReportID);
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: false,
        textTranslateKey: 'reportActionContextMenu.markAsUnread',
        icon: Expensicons.ChatBubbleUnread,
        successIcon: Expensicons.Checkmark,
        shouldShow: ({type, isUnreadChat}) => type === CONST.CONTEXT_MENU_TYPES.REPORT_ACTION || (type === CONST.CONTEXT_MENU_TYPES.REPORT && !isUnreadChat),
        onPress: (closePopover, {reportAction, reportID}) => {
            markCommentAsUnread(reportID, reportAction);
            if (closePopover) {
                hideContextMenu(true, ReportActionComposeFocusManager.focus);
            }
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: false,
        textTranslateKey: 'reportActionContextMenu.markAsRead',
        icon: Expensicons.Mail,
        successIcon: Expensicons.Checkmark,
        shouldShow: ({type, isUnreadChat}) => type === CONST.CONTEXT_MENU_TYPES.REPORT && isUnreadChat,
        onPress: (closePopover, {reportID}) => {
            readNewestAction(reportID, true);
            if (closePopover) {
                hideContextMenu(true, ReportActionComposeFocusManager.focus);
            }
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: false,
        textTranslateKey: 'reportActionContextMenu.editAction',
        icon: Expensicons.Pencil,
        shouldShow: ({type, reportAction, isArchivedRoom, isChronosReport, moneyRequestAction}) =>
            type === CONST.CONTEXT_MENU_TYPES.REPORT_ACTION && (canEditReportAction(reportAction) || canEditReportAction(moneyRequestAction)) && !isArchivedRoom && !isChronosReport,
        onPress: (closePopover, {reportID, reportAction, draftMessage, moneyRequestAction}) => {
            if (isMoneyRequestAction(reportAction) || isMoneyRequestAction(moneyRequestAction)) {
                hideContextMenu(false);
                const childReportID = reportAction?.childReportID;
                openReport(childReportID);
                Navigation.navigate(ROUTES.REPORT_WITH_ID.getRoute(childReportID));
                return;
            }
            const editAction = () => {
                if (!draftMessage) {
                    saveReportActionDraft(reportID, reportAction, Parser.htmlToMarkdown(getActionHtml(reportAction)));
                } else {
                    deleteReportActionDraft(reportID, reportAction);
                }
            };

            if (closePopover) {
                // Hide popover, then call editAction
                hideContextMenu(false, editAction);
                return;
            }

            // No popover to hide, call editAction immediately
            editAction();
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: false,
        textTranslateKey: 'iou.unhold',
        icon: Expensicons.Stopwatch,
        shouldShow: ({type, moneyRequestAction, areHoldRequirementsMet}) =>
            type === CONST.CONTEXT_MENU_TYPES.REPORT_ACTION && areHoldRequirementsMet && canHoldUnholdReportAction(moneyRequestAction).canUnholdRequest,
        onPress: (closePopover, {moneyRequestAction}) => {
            if (closePopover) {
                hideContextMenu(false, () => changeMoneyRequestHoldStatus(moneyRequestAction));
                return;
            }

            // No popover to hide, call changeMoneyRequestHoldStatus immediately
            changeMoneyRequestHoldStatus(moneyRequestAction);
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: false,
        textTranslateKey: 'iou.hold',
        icon: Expensicons.Stopwatch,
        shouldShow: ({type, moneyRequestAction, areHoldRequirementsMet}) =>
            type === CONST.CONTEXT_MENU_TYPES.REPORT_ACTION && areHoldRequirementsMet && canHoldUnholdReportAction(moneyRequestAction).canHoldRequest,
        onPress: (closePopover, {moneyRequestAction}) => {
            if (closePopover) {
                hideContextMenu(false, () => changeMoneyRequestHoldStatus(moneyRequestAction));
                return;
            }

            // No popover to hide, call changeMoneyRequestHoldStatus immediately
            changeMoneyRequestHoldStatus(moneyRequestAction);
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: false,
        textTranslateKey: 'reportActionContextMenu.joinThread',
        icon: Expensicons.Bell,
        shouldShow: ({reportAction, isArchivedRoom, isThreadReportParentAction}) => {
            const childReportNotificationPreference = getChildReportNotificationPreferenceReportUtils(reportAction);
            const isDeletedAction = isDeletedActionReportActionsUtils(reportAction);
            const shouldDisplayThreadReplies = shouldDisplayThreadRepliesReportUtils(reportAction, isThreadReportParentAction);
            const subscribed = childReportNotificationPreference !== 'hidden';
            const isWhisperAction = isWhisperActionReportActionsUtils(reportAction) || isActionableTrackExpense(reportAction);
            const isExpenseReportAction = isMoneyRequestAction(reportAction) || isReportPreviewActionReportActionsUtils(reportAction);
            const isTaskAction = isCreatedTaskReportAction(reportAction);
            return (
                !subscribed &&
                !isWhisperAction &&
                !isTaskAction &&
                !isExpenseReportAction &&
                !isThreadReportParentAction &&
                (shouldDisplayThreadReplies || (!isDeletedAction && !isArchivedRoom))
            );
        },
        onPress: (closePopover, {reportAction, reportID}) => {
            const childReportNotificationPreference = getChildReportNotificationPreferenceReportUtils(reportAction);
            const originalReportID = getOriginalReportID(reportID, reportAction);
            if (closePopover) {
                hideContextMenu(false, () => {
                    ReportActionComposeFocusManager.focus();
                    toggleSubscribeToChildReport(reportAction?.childReportID, reportAction, originalReportID, childReportNotificationPreference);
                });
                return;
            }

            ReportActionComposeFocusManager.focus();
            toggleSubscribeToChildReport(reportAction?.childReportID, reportAction, originalReportID, childReportNotificationPreference);
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: true,
        textTranslateKey: 'reportActionContextMenu.copyURLToClipboard',
        icon: Expensicons.Copy,
        successTextTranslateKey: 'reportActionContextMenu.copied',
        successIcon: Expensicons.Checkmark,
        shouldShow: ({type}) => type === CONST.CONTEXT_MENU_TYPES.LINK,
        onPress: (closePopover, {selection}) => {
            Clipboard.setString(selection);
            hideContextMenu(true, ReportActionComposeFocusManager.focus);
        },
        getDescription: (selection) => selection,
    },
    {
        isAnonymousAction: true,
        textTranslateKey: 'reportActionContextMenu.copyToClipboard',
        icon: Expensicons.Copy,
        successTextTranslateKey: 'reportActionContextMenu.copied',
        successIcon: Expensicons.Checkmark,
        shouldShow: ({type}) => type === CONST.CONTEXT_MENU_TYPES.TEXT,
        onPress: (closePopover, {selection}) => {
            Clipboard.setString(selection);
            hideContextMenu(true, ReportActionComposeFocusManager.focus);
        },
        getDescription: () => undefined,
    },
    {
        isAnonymousAction: true,
        textTranslateKey: 'reportActionContextMenu.copyEmailToClipboard',
        icon: Expensicons.Copy,
        successTextTranslateKey: 'reportActionContextMenu.copied',
        successIcon: Expensicons.Checkmark,
        shouldShow: ({type}) => type === CONST.CONTEXT_MENU_TYPES.EMAIL,
        onPress: (closePopover, {selection}) => {
            Clipboard.setString(EmailUtils.trimMailTo(selection));
            hideContextMenu(true, ReportActionComposeFocusManager.focus);
        },
        getDescription: (selection) => EmailUtils.prefixMailSeparatorsWithBreakOpportunities(EmailUtils.trimMailTo(selection ?? '')),
    },
    {
        isAnonymousAction: true,
        textTranslateKey: 'reportActionContextMenu.copyToClipboard',
        icon: Expensicons.Copy,
        successTextTranslateKey: 'reportActionContextMenu.copied',
        successIcon: Expensicons.Checkmark,
        shouldShow: ({type, reportAction}) =>
            type === CONST.CONTEXT_MENU_TYPES.REPORT_ACTION && !isReportActionAttachment(reportAction) && !isMessageDeleted(reportAction) && !isTripPreview(reportAction),

        // If return value is true, we switch the `text` and `icon` on
        // `ContextMenuItem` with `successText` and `successIcon` which will fall back to
        // the `text` and `icon`
        onPress: (closePopover, {reportAction, transaction, selection, report, reportID, card}) => {
            const isReportPreviewAction = isReportPreviewActionReportActionsUtils(reportAction);
            const messageHtml = getActionHtml(reportAction);
            const messageText = getReportActionMessageText(reportAction);

            const isAttachment = isReportActionAttachment(reportAction);
            if (!isAttachment) {
                const content = selection || messageHtml;
                if (isReportPreviewAction) {
                    const iouReportID = getIOUReportIDFromReportActionPreview(reportAction);
                    const displayMessage = getReportPreviewMessage(iouReportID, reportAction);
                    Clipboard.setString(displayMessage);
                } else if (isTaskActionReportActionsUtils(reportAction)) {
                    const {text, html} = getTaskReportActionMessage(reportAction);
                    const displayMessage = html ?? text;
                    setClipboardMessage(displayMessage);
                } else if (isModifiedExpenseAction(reportAction)) {
                    const modifyExpenseMessage = ModifiedExpenseMessage.getForReportAction({reportOrID: reportID, reportAction});
                    Clipboard.setString(modifyExpenseMessage);
                } else if (isReimbursementDeQueuedOrCanceledAction(reportAction)) {
                    const {expenseReportID} = getOriginalMessage(reportAction) ?? {};
                    const displayMessage = getReimbursementDeQueuedOrCanceledActionMessage(reportAction, expenseReportID);
                    Clipboard.setString(displayMessage);
                } else if (isMoneyRequestAction(reportAction)) {
                    const displayMessage = getIOUReportActionDisplayMessage(reportAction, transaction);
                    if (displayMessage === Parser.htmlToText(displayMessage)) {
                        Clipboard.setString(displayMessage);
                    } else {
                        setClipboardMessage(displayMessage);
                    }
                } else if (isCreatedTaskReportAction(reportAction)) {
                    const taskPreviewMessage = getTaskCreatedMessage(reportAction, true);
                    Clipboard.setString(taskPreviewMessage);
                } else if (isMemberChangeAction(reportAction)) {
                    const logMessage = getMemberChangeMessageFragment(reportAction, getReportName).html ?? '';
                    setClipboardMessage(logMessage);
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_NAME) {
                    Clipboard.setString(Str.htmlDecode(getWorkspaceNameUpdatedMessage(reportAction)));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_DESCRIPTION) {
                    Clipboard.setString(getWorkspaceDescriptionUpdatedMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_CURRENCY) {
                    Clipboard.setString(getWorkspaceCurrencyUpdateMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_AUTO_REPORTING_FREQUENCY) {
                    Clipboard.setString(getWorkspaceFrequencyUpdateMessage(reportAction));
                } else if (
                    reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.ADD_CATEGORY ||
                    reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.DELETE_CATEGORY ||
                    reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_CATEGORY ||
                    reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.SET_CATEGORY_NAME
                ) {
                    Clipboard.setString(getWorkspaceCategoryUpdateMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_TAG_LIST_NAME) {
                    Clipboard.setString(getCleanedTagName(getTagListNameUpdatedMessage(reportAction)));
                } else if (isTagModificationAction(reportAction.actionName)) {
                    Clipboard.setString(getCleanedTagName(getWorkspaceTagUpdateMessage(reportAction)));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_CUSTOM_UNIT) {
                    Clipboard.setString(getWorkspaceCustomUnitUpdatedMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.ADD_CUSTOM_UNIT_RATE) {
                    Clipboard.setString(getWorkspaceCustomUnitRateAddedMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_CUSTOM_UNIT_RATE) {
                    Clipboard.setString(getWorkspaceCustomUnitRateUpdatedMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.DELETE_CUSTOM_UNIT_RATE) {
                    Clipboard.setString(getWorkspaceCustomUnitRateDeletedMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.ADD_REPORT_FIELD) {
                    Clipboard.setString(getWorkspaceReportFieldAddMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_REPORT_FIELD) {
                    Clipboard.setString(getWorkspaceReportFieldUpdateMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.DELETE_REPORT_FIELD) {
                    Clipboard.setString(getWorkspaceReportFieldDeleteMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_FIELD) {
                    setClipboardMessage(getWorkspaceUpdateFieldMessage(reportAction));
                } else if (reportAction.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_MAX_EXPENSE_AMOUNT_NO_RECEIPT) {
                    Clipboard.setString(getPolicyChangeLogMaxExpenseAmountNoReceiptMessage(reportAction));
                } else if (reportAction.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_MAX_EXPENSE_AMOUNT) {
                    Clipboard.setString(getPolicyChangeLogMaxExpenseAmountMessage(reportAction));
                } else if (reportAction.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_DEFAULT_BILLABLE) {
                    Clipboard.setString(getPolicyChangeLogDefaultBillableMessage(reportAction));
                } else if (reportAction.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_DEFAULT_TITLE_ENFORCED) {
                    Clipboard.setString(getPolicyChangeLogDefaultTitleEnforcedMessage(reportAction));
                } else if (isReimbursementQueuedAction(reportAction)) {
                    Clipboard.setString(getReimbursementQueuedActionMessage({reportAction, reportOrID: reportID, shouldUseShortDisplayName: false}));
                } else if (isActionableMentionWhisper(reportAction)) {
                    const mentionWhisperMessage = getActionableMentionWhisperMessage(reportAction);
                    setClipboardMessage(mentionWhisperMessage);
                } else if (isActionableTrackExpense(reportAction)) {
                    setClipboardMessage(CONST.ACTIONABLE_TRACK_EXPENSE_WHISPER_MESSAGE);
                } else if (isRenamedAction(reportAction)) {
                    setClipboardMessage(getRenamedAction(reportAction, isExpenseReport(report)));
                } else if (
                    isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.SUBMITTED) ||
                    isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.SUBMITTED_AND_CLOSED) ||
                    isMarkAsClosedAction(reportAction)
                ) {
                    const harvesting = !isMarkAsClosedAction(reportAction) ? (getOriginalMessage(reportAction)?.harvesting ?? false) : false;
                    if (harvesting) {
                        setClipboardMessage(translateLocal('iou.automaticallySubmitted'));
                    } else {
                        Clipboard.setString(translateLocal('iou.submitted'));
                    }
                } else if (isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.APPROVED)) {
                    const {automaticAction} = getOriginalMessage(reportAction) ?? {};
                    if (automaticAction) {
                        setClipboardMessage(translateLocal('iou.automaticallyApproved'));
                    } else {
                        Clipboard.setString(translateLocal('iou.approvedMessage'));
                    }
                } else if (isUnapprovedAction(reportAction)) {
                    Clipboard.setString(translateLocal('iou.unapproved'));
                } else if (isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.FORWARDED)) {
                    const {automaticAction} = getOriginalMessage(reportAction) ?? {};
                    if (automaticAction) {
                        setClipboardMessage(translateLocal('iou.automaticallyForwarded'));
                    } else {
                        Clipboard.setString(translateLocal('iou.forwarded'));
                    }
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.REJECTED) {
                    const displayMessage = getRejectedReportMessage();
                    Clipboard.setString(displayMessage);
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.CORPORATE_UPGRADE) {
                    const displayMessage = getUpgradeWorkspaceMessage();
                    Clipboard.setString(displayMessage);
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.TEAM_DOWNGRADE) {
                    const displayMessage = getDowngradeWorkspaceMessage();
                    Clipboard.setString(displayMessage);
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.HOLD) {
                    Clipboard.setString(translateLocal('iou.heldExpense'));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.UNHOLD) {
                    Clipboard.setString(translateLocal('iou.unheldExpense'));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.RETRACTED) {
                    Clipboard.setString(translateLocal('iou.retracted'));
                } else if (isOldDotReportAction(reportAction)) {
                    const oldDotActionMessage = getMessageOfOldDotReportAction(reportAction);
                    Clipboard.setString(oldDotActionMessage);
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.DISMISSED_VIOLATION) {
                    const originalMessage = getOriginalMessage(reportAction) as ReportAction<typeof CONST.REPORT.ACTIONS.TYPE.DISMISSED_VIOLATION>['originalMessage'];
                    const reason = originalMessage?.reason;
                    const violationName = originalMessage?.violationName;
                    Clipboard.setString(translateLocal(`violationDismissal.${violationName}.${reason}` as TranslationPaths));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.RESOLVED_DUPLICATES) {
                    Clipboard.setString(translateLocal('violations.resolvedDuplicates'));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.EXPORTED_TO_INTEGRATION) {
                    setClipboardMessage(getExportIntegrationMessageHTML(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.ROOM_CHANGE_LOG.UPDATE_ROOM_DESCRIPTION) {
                    setClipboardMessage(getUpdateRoomDescriptionMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.ADD_EMPLOYEE) {
                    setClipboardMessage(getPolicyChangeLogAddEmployeeMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_EMPLOYEE) {
                    setClipboardMessage(getPolicyChangeLogUpdateEmployee(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.DELETE_EMPLOYEE) {
                    setClipboardMessage(getPolicyChangeLogDeleteMemberMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.DELETED_TRANSACTION) {
                    setClipboardMessage(getDeletedTransactionMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.REOPENED) {
                    setClipboardMessage(getReopenedMessage());
                } else if (isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.INTEGRATION_SYNC_FAILED)) {
                    setClipboardMessage(getIntegrationSyncFailedMessage(reportAction, report?.policyID));
                } else if (isCardIssuedAction(reportAction)) {
                    setClipboardMessage(getCardIssuedMessage({reportAction, shouldRenderHTML: true, policyID: report?.policyID, expensifyCard: card}));
                } else if (isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.ADD_INTEGRATION)) {
                    setClipboardMessage(getAddedConnectionMessage(reportAction));
                } else if (isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.DELETE_INTEGRATION)) {
                    setClipboardMessage(getRemovedConnectionMessage(reportAction));
                } else if (isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.TRAVEL_UPDATE)) {
                    setClipboardMessage(getTravelUpdateMessage(reportAction));
                } else if (isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_AUDIT_RATE)) {
                    setClipboardMessage(getUpdatedAuditRateMessage(reportAction));
                } else if (isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.ADD_APPROVER_RULE)) {
                    setClipboardMessage(getAddedApprovalRuleMessage(reportAction));
                } else if (isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.DELETE_APPROVER_RULE)) {
                    setClipboardMessage(getDeletedApprovalRuleMessage(reportAction));
                } else if (isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_APPROVER_RULE)) {
                    setClipboardMessage(getUpdatedApprovalRuleMessage(reportAction));
                } else if (isActionOfType(reportAction, CONST.REPORT.ACTIONS.TYPE.POLICY_CHANGE_LOG.UPDATE_MANUAL_APPROVAL_THRESHOLD)) {
                    setClipboardMessage(getUpdatedManualApprovalThresholdMessage(reportAction));
                } else if (reportAction?.actionName === CONST.REPORT.ACTIONS.TYPE.CHANGE_POLICY) {
                    const displayMessage = getPolicyChangeMessage(reportAction);
                    Clipboard.setString(displayMessage);
                } else if (isActionableJoinRequest(reportAction)) {
                    const displayMessage = getJoinRequestMessage(reportAction);
                    Clipboard.setString(displayMessage);
                } else if (content) {
                    setClipboardMessage(
                        content.replace(/(<mention-user>)(.*?)(<\/mention-user>)/gi, (match, openTag: string, innerContent: string, closeTag: string): string => {
                            const modifiedContent = Str.removeSMSDomain(innerContent) || '';
                            return openTag + modifiedContent + closeTag || '';
                        }),
                    );
                } else if (messageText) {
                    Clipboard.setString(messageText);
                }
            }

            if (closePopover) {
                hideContextMenu(true, ReportActionComposeFocusManager.focus);
            }
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: true,
        textTranslateKey: 'reportActionContextMenu.copyLink',
        icon: Expensicons.LinkCopy,
        successIcon: Expensicons.Checkmark,
        successTextTranslateKey: 'reportActionContextMenu.copied',
        shouldShow: ({type, reportAction, menuTarget}) => {
            const isAttachment = isReportActionAttachment(reportAction);

            // Only hide the copy link menu item when context menu is opened over img element.
            const isAttachmentTarget = menuTarget?.current && 'tagName' in menuTarget.current && menuTarget?.current.tagName === 'IMG' && isAttachment;
            return type === CONST.CONTEXT_MENU_TYPES.REPORT_ACTION && !isAttachmentTarget && !isMessageDeleted(reportAction);
        },
        onPress: (closePopover, {reportAction, reportID}) => {
            const originalReportID = getOriginalReportID(reportID, reportAction);
            getEnvironmentURL().then((environmentURL) => {
                const reportActionID = reportAction?.reportActionID;
                Clipboard.setString(`${environmentURL}/r/${originalReportID}/${reportActionID}`);
            });
            hideContextMenu(true, ReportActionComposeFocusManager.focus);
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: false,
        textTranslateKey: 'common.pin',
        icon: Expensicons.Pin,
        shouldShow: ({type, isPinnedChat}) => type === CONST.CONTEXT_MENU_TYPES.REPORT && !isPinnedChat,
        onPress: (closePopover, {reportID}) => {
            togglePinnedState(reportID, false);
            if (closePopover) {
                hideContextMenu(false, ReportActionComposeFocusManager.focus);
            }
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: false,
        textTranslateKey: 'common.unPin',
        icon: Expensicons.Pin,
        shouldShow: ({type, isPinnedChat}) => type === CONST.CONTEXT_MENU_TYPES.REPORT && isPinnedChat,
        onPress: (closePopover, {reportID}) => {
            togglePinnedState(reportID, true);
            if (closePopover) {
                hideContextMenu(false, ReportActionComposeFocusManager.focus);
            }
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: false,
        textTranslateKey: 'reportActionContextMenu.flagAsOffensive',
        icon: Expensicons.Flag,
        shouldShow: ({type, reportAction, isArchivedRoom, isChronosReport, reportID}) =>
            type === CONST.CONTEXT_MENU_TYPES.REPORT_ACTION &&
            canFlagReportAction(reportAction, reportID) &&
            !isArchivedRoom &&
            !isChronosReport &&
            reportAction?.actorAccountID !== CONST.ACCOUNT_ID.CONCIERGE,
        onPress: (closePopover, {reportID, reportAction}) => {
            if (!reportID) {
                return;
            }

            const activeRoute = Navigation.getActiveRoute();
            if (closePopover) {
                hideContextMenu(false, () => {
                    KeyboardUtils.dismiss().then(() => {
                        Navigation.navigate(ROUTES.FLAG_COMMENT.getRoute(reportID, reportAction?.reportActionID, activeRoute));
                    });
                });
                return;
            }

            Navigation.navigate(ROUTES.FLAG_COMMENT.getRoute(reportID, reportAction?.reportActionID, activeRoute));
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: true,
        textTranslateKey: 'common.download',
        icon: Expensicons.Download,
        successTextTranslateKey: 'common.download',
        successIcon: Expensicons.Download,
        shouldShow: ({reportAction, isOffline}) => {
            const isAttachment = isReportActionAttachment(reportAction);
            const html = getActionHtml(reportAction);
            const isUploading = html.includes(CONST.ATTACHMENT_OPTIMISTIC_SOURCE_ATTRIBUTE);
            return isAttachment && !isUploading && !!reportAction?.reportActionID && !isMessageDeleted(reportAction) && !isOffline;
        },
        onPress: (closePopover, {reportAction}) => {
            const html = getActionHtml(reportAction);
            const {originalFileName, sourceURL} = getAttachmentDetails(html);
            const sourceURLWithAuth = addEncryptedAuthTokenToURL(sourceURL ?? '');
            const sourceID = (sourceURL?.match(CONST.REGEX.ATTACHMENT_ID) ?? [])[1];
            setDownload(sourceID, true);
            const anchorRegex = CONST.REGEX_LINK_IN_ANCHOR;
            const isAnchorTag = anchorRegex.test(html);
            fileDownload(sourceURLWithAuth, originalFileName ?? '', '', isAnchorTag && isMobileSafari()).then(() => setDownload(sourceID, false));
            if (closePopover) {
                hideContextMenu(true, ReportActionComposeFocusManager.focus);
            }
        },
        getDescription: () => {},
        shouldDisable: (download) => download?.isDownloading ?? false,
    },
    {
        isAnonymousAction: true,
        textTranslateKey: 'reportActionContextMenu.copyOnyxData',
        icon: Expensicons.Copy,
        successTextTranslateKey: 'reportActionContextMenu.copied',
        successIcon: Expensicons.Checkmark,
        shouldShow: ({type, isProduction}) => type === CONST.CONTEXT_MENU_TYPES.REPORT && !isProduction,
        onPress: (closePopover, {report}) => {
            Clipboard.setString(JSON.stringify(report, null, 4));
            hideContextMenu(true, ReportActionComposeFocusManager.focus);
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: true,
        textTranslateKey: 'debug.debug',
        icon: Expensicons.Bug,
        shouldShow: ({type, account}) => [CONST.CONTEXT_MENU_TYPES.REPORT_ACTION, CONST.CONTEXT_MENU_TYPES.REPORT].some((value) => value === type) && !!account?.isDebugModeEnabled,
        onPress: (closePopover, {reportID, reportAction}) => {
            if (reportAction) {
                Navigation.navigate(ROUTES.DEBUG_REPORT_ACTION.getRoute(reportID, reportAction.reportActionID));
            } else {
                Navigation.navigate(ROUTES.DEBUG_REPORT.getRoute(reportID));
            }
            hideContextMenu(false, ReportActionComposeFocusManager.focus);
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: false,
        textTranslateKey: 'reportActionContextMenu.deleteAction',
        icon: Expensicons.Trashcan,
        shouldShow: ({type, reportAction, isArchivedRoom, isChronosReport, reportID, moneyRequestAction, iouTransaction}) =>
            // Until deleting parent threads is supported in FE, we will prevent the user from deleting a thread parent
            !!reportID &&
            type === CONST.CONTEXT_MENU_TYPES.REPORT_ACTION &&
            canDeleteReportAction(
                moneyRequestAction ?? reportAction,
                isMoneyRequestAction(moneyRequestAction) ? getOriginalMessage(moneyRequestAction)?.IOUReportID : reportID,
                iouTransaction,
            ) &&
            !isArchivedRoom &&
            !isChronosReport &&
            !isMessageDeleted(reportAction),
        onPress: (closePopover, {reportID: reportIDParam, reportAction, moneyRequestAction}) => {
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            const reportID = isMoneyRequestAction(moneyRequestAction) ? getOriginalMessage(moneyRequestAction)?.IOUReportID || reportIDParam : reportIDParam;
            if (closePopover) {
                // Hide popover, then call showDeleteConfirmModal
                hideContextMenu(false, () => showDeleteModal(reportID, moneyRequestAction ?? reportAction));
                return;
            }

            // No popover to hide, call showDeleteConfirmModal immediately
            showDeleteModal(reportID, moneyRequestAction ?? reportAction);
        },
        getDescription: () => {},
    },
    {
        isAnonymousAction: true,
        textTranslateKey: 'reportActionContextMenu.menu',
        icon: Expensicons.ThreeDots,
        shouldShow: ({isMini}) => isMini,
        onPress: (closePopover, {openOverflowMenu, event, openContextMenu, anchorRef}) => {
            openOverflowMenu(event as GestureResponderEvent | MouseEvent, anchorRef ?? {current: null});
            openContextMenu();
        },
        getDescription: () => {},
        shouldPreventDefaultFocusOnPress: false,
    },
];

const restrictedReadOnlyActions: TranslationPaths[] = [
    'reportActionContextMenu.replyInThread',
    'reportActionContextMenu.editAction',
    'reportActionContextMenu.joinThread',
    'reportActionContextMenu.deleteAction',
];

const RestrictedReadOnlyContextMenuActions: ContextMenuAction[] = ContextMenuActions.filter(
    (action) => 'textTranslateKey' in action && restrictedReadOnlyActions.includes(action.textTranslateKey),
);

export {RestrictedReadOnlyContextMenuActions};
export default ContextMenuActions;
export type {ContextMenuActionPayload, ContextMenuAction};

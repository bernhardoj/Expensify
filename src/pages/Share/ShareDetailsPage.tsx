import type {StackScreenProps} from '@react-navigation/stack';
import React, {useEffect, useMemo, useState} from 'react';
import {SafeAreaView, View} from 'react-native';
import type {OnyxEntry} from 'react-native-onyx';
import type {FileObject} from '@components/AttachmentModal';
import AttachmentModal from '@components/AttachmentModal';
import AttachmentPreview from '@components/AttachmentPreview';
import Button from '@components/Button';
import FixedFooter from '@components/FixedFooter';
import HeaderWithBackButton from '@components/HeaderWithBackButton';
import {FallbackAvatar} from '@components/Icon/Expensicons';
import {PressableWithoutFeedback} from '@components/Pressable';
import ScreenWrapper from '@components/ScreenWrapper';
import ScrollView from '@components/ScrollView';
import Text from '@components/Text';
import TextInput from '@components/TextInput';
import useFilesValidation from '@hooks/useFilesValidation';
import useLocalize from '@hooks/useLocalize';
import useOnyx from '@hooks/useOnyx';
import useThemeStyles from '@hooks/useThemeStyles';
import {addAttachment, addComment, getCurrentUserAccountID, openReport} from '@libs/actions/Report';
import {canUseTouchScreen} from '@libs/DeviceCapabilities';
import {getFileName, readFileAsync} from '@libs/fileDownload/FileUtils';
import Navigation from '@libs/Navigation/Navigation';
import type {ShareNavigatorParamList} from '@libs/Navigation/types';
import {getReportDisplayOption} from '@libs/OptionsListUtils';
import {getReportOrDraftReport, isDraftReport} from '@libs/ReportUtils';
import NotFoundPage from '@pages/ErrorPage/NotFoundPage';
import variables from '@styles/variables';
import UserListItem from '@src/components/SelectionList/UserListItem';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type SCREENS from '@src/SCREENS';
import type {Report as ReportType} from '@src/types/onyx';
import {isEmptyObject} from '@src/types/utils/EmptyObject';
import KeyboardUtils from '@src/utils/keyboard';
import getFileSize from './getFileSize';
import {showErrorAlert} from './ShareRootPage';

type ShareDetailsPageProps = StackScreenProps<ShareNavigatorParamList, typeof SCREENS.SHARE.SHARE_DETAILS>;

function ShareDetailsPage({
    route: {
        params: {reportOrAccountID},
    },
}: ShareDetailsPageProps) {
    const styles = useThemeStyles();
    const {translate} = useLocalize();
    const [unknownUserDetails] = useOnyx(ONYXKEYS.SHARE_UNKNOWN_USER_DETAILS, {canBeMissing: true});
    const [currentAttachment] = useOnyx(ONYXKEYS.SHARE_TEMP_FILE, {canBeMissing: true});
    const [reportAttributesDerived] = useOnyx(ONYXKEYS.DERIVED.REPORT_ATTRIBUTES, {canBeMissing: true, selector: (val) => val?.reports});
    const isTextShared = currentAttachment?.mimeType === 'txt';
    const [message, setMessage] = useState(isTextShared ? (currentAttachment?.content ?? '') : '');
    const [errorTitle, setErrorTitle] = useState<string | undefined>(undefined);
    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

    const [validFilesToUpload, setValidFilesToUpload] = useState<FileObject[]>([]);
    const {validateFiles} = useFilesValidation(setValidFilesToUpload);

    const report: OnyxEntry<ReportType> = getReportOrDraftReport(reportOrAccountID);
    const displayReport = useMemo(() => getReportDisplayOption(report, unknownUserDetails, reportAttributesDerived), [report, unknownUserDetails, reportAttributesDerived]);

    useEffect(() => {
        if (!currentAttachment || isTextShared || validFilesToUpload.length !== 0) {
            return;
        }

        validateFiles([{name: currentAttachment.id, uri: currentAttachment.content, type: currentAttachment.mimeType}]);
    }, [currentAttachment, isTextShared, validFilesToUpload.length, validateFiles]);

    useEffect(() => {
        if (!currentAttachment?.content || errorTitle) {
            return;
        }
        getFileSize(currentAttachment?.content).then((size) => {
            if (size > CONST.API_ATTACHMENT_VALIDATIONS.MAX_SIZE) {
                setErrorTitle(translate('attachmentPicker.attachmentTooLarge'));
                setErrorMessage(translate('attachmentPicker.sizeExceeded'));
            }

            if (size < CONST.API_ATTACHMENT_VALIDATIONS.MIN_SIZE) {
                setErrorTitle(translate('attachmentPicker.attachmentTooSmall'));
                setErrorMessage(translate('attachmentPicker.sizeNotMet'));
            }
        });
    }, [currentAttachment, errorTitle, translate]);

    useEffect(() => {
        if (!errorTitle || !errorMessage) {
            return;
        }

        showErrorAlert(errorTitle, errorMessage);
    }, [errorTitle, errorMessage]);

    if (isEmptyObject(report)) {
        return <NotFoundPage />;
    }

    const isDraft = isDraftReport(reportOrAccountID);
    const currentUserID = getCurrentUserAccountID();
    const shouldShowAttachment = !isTextShared;

    const fileName = currentAttachment?.content.split('/').pop();

    const handleShare = () => {
        if (!currentAttachment || validFilesToUpload.length === 0) {
            return;
        }

        if (isTextShared) {
            addComment(report.reportID, message);
            const routeToNavigate = ROUTES.REPORT_WITH_ID.getRoute(reportOrAccountID);
            Navigation.navigate(routeToNavigate, {forceReplace: true});
            return;
        }

        const validatedFile = validFilesToUpload.at(0);
        readFileAsync(
            validatedFile?.uri ?? '',
            getFileName(validatedFile?.uri ?? 'shared_image.png'),
            (file) => {
                if (isDraft) {
                    openReport(
                        report.reportID,
                        '',
                        displayReport.participantsList?.filter((u) => u.accountID !== currentUserID).map((u) => u.login ?? '') ?? [],
                        report,
                        undefined,
                        undefined,
                        undefined,
                    );
                }
                if (report.reportID) {
                    addAttachment(report.reportID, file, message);
                }

                const routeToNavigate = ROUTES.REPORT_WITH_ID.getRoute(reportOrAccountID);
                Navigation.navigate(routeToNavigate, {forceReplace: true});
            },
            () => {},
            validatedFile?.type ?? 'image/jpeg',
        );
    };

    return (
        <ScreenWrapper
            includeSafeAreaPaddingBottom
            keyboardAvoidingViewBehavior="padding"
            shouldEnableMinHeight={canUseTouchScreen()}
            testID={ShareDetailsPage.displayName}
        >
            <View style={[styles.flex1, styles.flexColumn, styles.h100, styles.appBG]}>
                <PressableWithoutFeedback
                    onPress={() => {
                        KeyboardUtils.dismiss();
                    }}
                    accessible={false}
                >
                    <HeaderWithBackButton
                        title={translate('share.shareToExpensify')}
                        shouldShowBackButton
                    />

                    {!!report && (
                        <View>
                            <View style={[styles.optionsListSectionHeader, styles.justifyContentCenter]}>
                                <Text style={[styles.ph5, styles.textLabelSupporting]}>{translate('common.to')}</Text>
                            </View>
                            <UserListItem
                                item={displayReport}
                                isFocused={false}
                                showTooltip={false}
                                onSelectRow={() => {
                                    KeyboardUtils.dismiss();
                                }}
                                pressableStyle={[styles.flexRow]}
                                shouldSyncFocus={false}
                            />
                        </View>
                    )}
                </PressableWithoutFeedback>
                <View style={[styles.ph5, styles.flex1, styles.flexColumn, styles.overflowHidden]}>
                    <View style={styles.pv3}>
                        <ScrollView scrollEnabled={false}>
                            <TextInput
                                autoFocus={false}
                                value={message}
                                scrollEnabled
                                type="markdown"
                                autoGrowHeight
                                maxAutoGrowHeight={variables.textInputAutoGrowMaxHeight}
                                onChangeText={setMessage}
                                accessibilityLabel={translate('share.messageInputLabel')}
                                label={translate('share.messageInputLabel')}
                            />
                        </ScrollView>
                    </View>
                    <PressableWithoutFeedback
                        onPress={() => {
                            KeyboardUtils.dismiss();
                        }}
                        accessible={false}
                    >
                        {shouldShowAttachment && (
                            <>
                                <View style={[styles.pt6, styles.pb2]}>
                                    <Text style={styles.textLabelSupporting}>{translate('common.attachment')}</Text>
                                </View>
                                <SafeAreaView>
                                    <AttachmentModal
                                        headerTitle={fileName}
                                        source={validFilesToUpload.at(0)?.uri}
                                        originalFileName={fileName}
                                        fallbackSource={FallbackAvatar}
                                    >
                                        {({show}) => (
                                            <AttachmentPreview
                                                source={validFilesToUpload.at(0)?.uri ?? ''}
                                                aspectRatio={currentAttachment?.aspectRatio}
                                                onPress={show}
                                                onLoadError={() => {
                                                    showErrorAlert(translate('attachmentPicker.attachmentError'), translate('attachmentPicker.errorWhileSelectingCorruptedAttachment'));
                                                }}
                                            />
                                        )}
                                    </AttachmentModal>
                                </SafeAreaView>
                            </>
                        )}
                    </PressableWithoutFeedback>
                </View>
                <FixedFooter style={[styles.pt4]}>
                    <Button
                        success
                        large
                        text={translate('common.share')}
                        style={styles.w100}
                        onPress={handleShare}
                    />
                </FixedFooter>
            </View>
        </ScreenWrapper>
    );
}

ShareDetailsPage.displayName = 'ShareDetailsPage';
export default ShareDetailsPage;

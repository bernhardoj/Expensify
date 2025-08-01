import {Str} from 'expensify-common';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import DelegateNoAccessWrapper from '@components/DelegateNoAccessWrapper';
import DotIndicatorMessage from '@components/DotIndicatorMessage';
import FormProvider from '@components/Form/FormProvider';
import InputWrapper from '@components/Form/InputWrapper';
import type {FormOnyxValues} from '@components/Form/types';
import HeaderWithBackButton from '@components/HeaderWithBackButton';
import type {AnimatedTextInputRef} from '@components/RNTextInput';
import ScreenWrapper from '@components/ScreenWrapper';
import Text from '@components/Text';
import TextInput from '@components/TextInput';
import ValidateCodeActionModal from '@components/ValidateCodeActionModal';
import useBeforeRemove from '@hooks/useBeforeRemove';
import useLocalize from '@hooks/useLocalize';
import useOnyx from '@hooks/useOnyx';
import usePrevious from '@hooks/usePrevious';
import useThemeStyles from '@hooks/useThemeStyles';
import {addErrorMessage, getLatestErrorField} from '@libs/ErrorUtils';
import {getPhoneLogin, validateNumber} from '@libs/LoginUtils';
import Navigation from '@libs/Navigation/Navigation';
import type {PlatformStackScreenProps} from '@libs/Navigation/PlatformStackNavigation/types';
import type {SettingsNavigatorParamList} from '@libs/Navigation/types';
import {addSMSDomainIfPhoneNumber} from '@libs/PhoneNumber';
import {getContactMethod} from '@libs/UserUtils';
import {
    addNewContactMethod as addNewContactMethodUser,
    addPendingContactMethod,
    clearContactMethod,
    clearContactMethodErrors,
    clearPendingContactActionErrors,
    clearUnvalidatedNewContactMethodAction,
    requestValidateCodeAction,
} from '@userActions/User';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type SCREENS from '@src/SCREENS';
import INPUT_IDS from '@src/types/form/NewContactMethodForm';
import type {Errors} from '@src/types/onyx/OnyxCommon';

type NewContactMethodPageProps = PlatformStackScreenProps<SettingsNavigatorParamList, typeof SCREENS.SETTINGS.PROFILE.NEW_CONTACT_METHOD>;

function NewContactMethodPage({route}: NewContactMethodPageProps) {
    const contactMethod = getContactMethod();
    const styles = useThemeStyles();
    const {translate} = useLocalize();
    const loginInputRef = useRef<AnimatedTextInputRef>(null);
    const [isValidateCodeActionModalVisible, setIsValidateCodeActionModalVisible] = useState(false);
    const [pendingContactAction] = useOnyx(ONYXKEYS.PENDING_CONTACT_ACTION, {canBeMissing: true});
    const [loginList] = useOnyx(ONYXKEYS.LOGIN_LIST, {canBeMissing: true});
    const loginData = loginList?.[pendingContactAction?.contactMethod ?? contactMethod];
    const validateLoginError = getLatestErrorField(loginData, 'addedLogin');

    const navigateBackTo = route?.params?.backTo;

    const hasFailedToSendVerificationCode = !!pendingContactAction?.errorFields?.actionVerified;

    const handleValidateMagicCode = useCallback((values: FormOnyxValues<typeof ONYXKEYS.FORMS.NEW_CONTACT_METHOD_FORM>) => {
        const phoneLogin = getPhoneLogin(values.phoneOrEmail);
        const validateIfNumber = validateNumber(phoneLogin);
        const submitDetail = (validateIfNumber || values.phoneOrEmail).trim().toLowerCase();
        addPendingContactMethod(submitDetail);
        setIsValidateCodeActionModalVisible(true);
    }, []);

    const addNewContactMethod = useCallback(
        (magicCode: string) => {
            addNewContactMethodUser(addSMSDomainIfPhoneNumber(pendingContactAction?.contactMethod ?? ''), magicCode);
        },
        [pendingContactAction?.contactMethod],
    );
    const prevPendingContactAction = usePrevious(pendingContactAction);

    useBeforeRemove(() => setIsValidateCodeActionModalVisible(false));

    useEffect(() => {
        if (!pendingContactAction?.actionVerified || !prevPendingContactAction?.contactMethod) {
            return;
        }

        Navigation.goBack(ROUTES.SETTINGS_CONTACT_METHOD_DETAILS.getRoute(addSMSDomainIfPhoneNumber(prevPendingContactAction?.contactMethod ?? ''), navigateBackTo, true));
        clearUnvalidatedNewContactMethodAction();
    }, [pendingContactAction?.actionVerified, prevPendingContactAction?.contactMethod, navigateBackTo]);

    const validate = useCallback(
        (values: FormOnyxValues<typeof ONYXKEYS.FORMS.NEW_CONTACT_METHOD_FORM>): Errors => {
            const phoneLogin = getPhoneLogin(values.phoneOrEmail);
            const validateIfNumber = validateNumber(phoneLogin);

            const errors = {};

            if (!values.phoneOrEmail) {
                addErrorMessage(errors, 'phoneOrEmail', translate('contacts.genericFailureMessages.contactMethodRequired'));
            } else if (values.phoneOrEmail.length > CONST.LOGIN_CHARACTER_LIMIT) {
                addErrorMessage(
                    errors,
                    'phoneOrEmail',
                    translate('common.error.characterLimitExceedCounter', {
                        length: values.phoneOrEmail.length,
                        limit: CONST.LOGIN_CHARACTER_LIMIT,
                    }),
                );
            }

            if (!!values.phoneOrEmail && !(validateIfNumber || Str.isValidEmail(values.phoneOrEmail))) {
                addErrorMessage(errors, 'phoneOrEmail', translate('contacts.genericFailureMessages.invalidContactMethod'));
            }

            if (!!values.phoneOrEmail && loginList?.[validateIfNumber || values.phoneOrEmail.toLowerCase()]) {
                addErrorMessage(errors, 'phoneOrEmail', translate('contacts.genericFailureMessages.enteredMethodIsAlreadySubmitted'));
            }

            return errors;
        },
        // We don't need `loginList` because when submitting this form
        // the loginList gets updated, causing this function to run again.
        // https://github.com/Expensify/App/issues/20610
        // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps
        [translate],
    );

    const onBackButtonPress = useCallback(() => {
        Navigation.goBack(ROUTES.SETTINGS_CONTACT_METHODS.getRoute(navigateBackTo));
    }, [navigateBackTo]);

    return (
        <ScreenWrapper
            onEntryTransitionEnd={() => loginInputRef.current?.focus()}
            includeSafeAreaPaddingBottom
            shouldEnableMaxHeight
            testID={NewContactMethodPage.displayName}
        >
            <DelegateNoAccessWrapper accessDeniedVariants={[CONST.DELEGATE.DENIED_ACCESS_VARIANTS.DELEGATE]}>
                <HeaderWithBackButton
                    title={translate('contacts.newContactMethod')}
                    onBackButtonPress={onBackButtonPress}
                />
                <FormProvider
                    formID={ONYXKEYS.FORMS.NEW_CONTACT_METHOD_FORM}
                    validate={validate}
                    onSubmit={handleValidateMagicCode}
                    submitButtonText={translate('common.add')}
                    style={[styles.flexGrow1, styles.mh5]}
                    shouldHideFixErrorsAlert
                >
                    <Text style={styles.mb5}>{translate('common.pleaseEnterEmailOrPhoneNumber')}</Text>
                    <View style={styles.mb6}>
                        <InputWrapper
                            InputComponent={TextInput}
                            label={`${translate('common.email')}/${translate('common.phoneNumber')}`}
                            aria-label={`${translate('common.email')}/${translate('common.phoneNumber')}`}
                            role={CONST.ROLE.PRESENTATION}
                            inputMode={CONST.INPUT_MODE.EMAIL}
                            ref={loginInputRef}
                            inputID={INPUT_IDS.PHONE_OR_EMAIL}
                            autoCapitalize="none"
                            enterKeyHint="done"
                        />
                    </View>
                    {hasFailedToSendVerificationCode && (
                        <DotIndicatorMessage
                            messages={getLatestErrorField(pendingContactAction, 'actionVerified')}
                            type="error"
                        />
                    )}
                </FormProvider>
                <ValidateCodeActionModal
                    validateCodeActionErrorField="addedLogin"
                    validateError={validateLoginError}
                    handleSubmitForm={addNewContactMethod}
                    clearError={() => {
                        if (!loginData) {
                            return;
                        }
                        clearContactMethodErrors(addSMSDomainIfPhoneNumber(pendingContactAction?.contactMethod ?? contactMethod), 'addedLogin');
                        clearPendingContactActionErrors();
                    }}
                    onClose={() => {
                        if (pendingContactAction?.contactMethod) {
                            clearContactMethod(pendingContactAction?.contactMethod);
                            clearUnvalidatedNewContactMethodAction();
                        }
                        setIsValidateCodeActionModalVisible(false);
                    }}
                    isVisible={isValidateCodeActionModalVisible}
                    title={translate('delegate.makeSureItIsYou')}
                    sendValidateCode={() => requestValidateCodeAction()}
                    descriptionPrimary={translate('contacts.enterMagicCode', {contactMethod})}
                />
            </DelegateNoAccessWrapper>
        </ScreenWrapper>
    );
}

NewContactMethodPage.displayName = 'NewContactMethodPage';

export default NewContactMethodPage;

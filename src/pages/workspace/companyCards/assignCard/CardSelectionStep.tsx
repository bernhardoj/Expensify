import React, {useMemo, useState} from 'react';
import {View} from 'react-native';
import FormAlertWithSubmitButton from '@components/FormAlertWithSubmitButton';
import Icon from '@components/Icon';
import {BrokenMagnifyingGlass} from '@components/Icon/Illustrations';
import InteractiveStepSubHeader from '@components/InteractiveStepSubHeader';
import InteractiveStepWrapper from '@components/InteractiveStepWrapper';
import PlaidCardFeedIcon from '@components/PlaidCardFeedIcon';
import SelectionList from '@components/SelectionList';
import RadioListItem from '@components/SelectionList/RadioListItem';
import Text from '@components/Text';
import TextLink from '@components/TextLink';
import useBottomSafeSafeAreaPaddingStyle from '@hooks/useBottomSafeSafeAreaPaddingStyle';
import useCardFeeds from '@hooks/useCardFeeds';
import useCardsList from '@hooks/useCardsList';
import useEnvironment from '@hooks/useEnvironment';
import useLocalize from '@hooks/useLocalize';
import useOnyx from '@hooks/useOnyx';
import useThemeIllustrations from '@hooks/useThemeIllustrations';
import useThemeStyles from '@hooks/useThemeStyles';
import {setAssignCardStepAndData} from '@libs/actions/CompanyCards';
import {getBankName, getCardFeedIcon, getCustomOrFormattedFeedName, getFilteredCardList, getPlaidInstitutionIconUrl, lastFourNumbersFromCardName, maskCardNumber} from '@libs/CardUtils';
import {getPersonalDetailByEmail} from '@libs/PersonalDetailsUtils';
import tokenizedSearch from '@libs/tokenizedSearch';
import variables from '@styles/variables';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type {CompanyCardFeed} from '@src/types/onyx';

type CardSelectionStepProps = {
    /** Selected feed */
    feed: CompanyCardFeed;

    /** Current policy id */
    policyID: string | undefined;
};

function CardSelectionStep({feed, policyID}: CardSelectionStepProps) {
    const {translate} = useLocalize();
    const styles = useThemeStyles();
    const illustrations = useThemeIllustrations();
    const {environmentURL} = useEnvironment();
    const [searchText, setSearchText] = useState('');
    const [assignCard] = useOnyx(ONYXKEYS.ASSIGN_CARD, {canBeMissing: false});
    const [list] = useCardsList(policyID, feed);
    const [workspaceCardFeeds] = useOnyx(ONYXKEYS.COLLECTION.WORKSPACE_CARDS_LIST, {canBeMissing: false});
    const [cardFeeds] = useCardFeeds(policyID);
    const plaidUrl = getPlaidInstitutionIconUrl(feed);
    const formattedFeedName = getCustomOrFormattedFeedName(feed, cardFeeds?.settings?.companyCardNicknames);

    const isEditing = assignCard?.isEditing;
    const assigneeDisplayName = getPersonalDetailByEmail(assignCard?.data?.email ?? '')?.displayName ?? '';
    const filteredCardList = getFilteredCardList(list, cardFeeds?.settings?.oAuthAccountDetails?.[feed], workspaceCardFeeds);

    const [cardSelected, setCardSelected] = useState(assignCard?.data?.encryptedCardNumber ?? '');
    const [shouldShowError, setShouldShowError] = useState(false);

    const handleBackButtonPress = () => {
        if (isEditing) {
            setAssignCardStepAndData({
                currentStep: CONST.COMPANY_CARD.STEP.CONFIRMATION,
                isEditing: false,
            });
            return;
        }
        setAssignCardStepAndData({currentStep: CONST.COMPANY_CARD.STEP.ASSIGNEE});
    };

    const handleSelectCard = (cardNumber: string) => {
        setCardSelected(cardNumber);
        setShouldShowError(false);
    };

    const submit = () => {
        if (!cardSelected) {
            setShouldShowError(true);
            return;
        }

        const cardNumber =
            Object.entries(filteredCardList)
                .find(([, encryptedCardNumber]) => encryptedCardNumber === cardSelected)
                ?.at(0) ?? '';

        setAssignCardStepAndData({
            currentStep: isEditing ? CONST.COMPANY_CARD.STEP.CONFIRMATION : CONST.COMPANY_CARD.STEP.TRANSACTION_START_DATE,
            data: {encryptedCardNumber: cardSelected, cardNumber},
            isEditing: false,
        });
    };

    const cardListOptions = Object.entries(filteredCardList).map(([cardNumber, encryptedCardNumber]) => ({
        keyForList: encryptedCardNumber,
        value: encryptedCardNumber,
        text: maskCardNumber(cardNumber, feed),
        alternateText: lastFourNumbersFromCardName(cardNumber),
        isSelected: cardSelected === encryptedCardNumber,
        leftElement: plaidUrl ? (
            <PlaidCardFeedIcon
                plaidUrl={plaidUrl}
                style={styles.mr3}
            />
        ) : (
            <Icon
                src={getCardFeedIcon(feed, illustrations)}
                height={variables.cardIconHeight}
                width={variables.iconSizeExtraLarge}
                additionalStyles={[styles.mr3, styles.cardIcon]}
            />
        ),
    }));

    const searchedListOptions = useMemo(() => {
        return tokenizedSearch(cardListOptions, searchText, (option) => [option.text]);
    }, [searchText, cardListOptions]);

    const safeAreaPaddingBottomStyle = useBottomSafeSafeAreaPaddingStyle();

    return (
        <InteractiveStepWrapper
            wrapperID={CardSelectionStep.displayName}
            handleBackButtonPress={handleBackButtonPress}
            headerTitle={translate('workspace.companyCards.assignCard')}
            headerSubtitle={assigneeDisplayName}
            enableEdgeToEdgeBottomSafeAreaPadding
        >
            {!cardListOptions.length ? (
                <View style={[styles.flex1, styles.justifyContentCenter, styles.alignItemsCenter, styles.ph5, styles.mb9, safeAreaPaddingBottomStyle]}>
                    <Icon
                        src={BrokenMagnifyingGlass}
                        width={116}
                        height={168}
                    />
                    <Text style={[styles.textHeadlineLineHeightXXL, styles.mt3]}>{translate('workspace.companyCards.noActiveCards')}</Text>
                    <Text style={[styles.textSupporting, styles.ph5, styles.mv3, styles.textAlignCenter]}>
                        {translate('workspace.companyCards.somethingMightBeBroken')}{' '}
                        <TextLink
                            href={`${environmentURL}/${ROUTES.CONCIERGE}`}
                            style={styles.link}
                        >
                            {translate('workspace.companyCards.contactConcierge')}
                        </TextLink>
                        .
                    </Text>
                </View>
            ) : (
                <SelectionList
                    sections={[{data: searchedListOptions}]}
                    headerMessage={searchedListOptions.length ? undefined : translate('common.noResultsFound')}
                    shouldShowTextInput={cardListOptions.length > CONST.COMPANY_CARDS.CARD_LIST_THRESHOLD}
                    textInputLabel={translate('common.search')}
                    textInputValue={searchText}
                    onChangeText={setSearchText}
                    ListItem={RadioListItem}
                    onSelectRow={({value}) => handleSelectCard(value)}
                    initiallyFocusedOptionKey={cardSelected}
                    listHeaderContent={
                        <View>
                            <View style={[styles.ph5, styles.mb5, styles.mt3, {height: CONST.BANK_ACCOUNT.STEPS_HEADER_HEIGHT}]}>
                                <InteractiveStepSubHeader
                                    startStepIndex={1}
                                    stepNames={CONST.COMPANY_CARD.STEP_NAMES}
                                />
                            </View>
                            <Text style={[styles.textHeadlineLineHeightXXL, styles.ph5, styles.mt3]}>{translate('workspace.companyCards.chooseCard')}</Text>
                            <Text style={[styles.textSupporting, styles.ph5, styles.mv3]}>
                                {translate('workspace.companyCards.chooseCardFor', {
                                    assignee: assigneeDisplayName,
                                    feed: plaidUrl && formattedFeedName ? formattedFeedName : getBankName(feed),
                                })}
                            </Text>
                        </View>
                    }
                    shouldShowTextInputAfterHeader
                    shouldShowHeaderMessageAfterHeader
                    addBottomSafeAreaPadding
                    shouldShowListEmptyContent={false}
                    shouldScrollToFocusedIndex={false}
                    shouldUpdateFocusedIndex
                    footerContent={
                        <FormAlertWithSubmitButton
                            buttonText={translate(isEditing ? 'common.confirm' : 'common.next')}
                            onSubmit={submit}
                            isAlertVisible={shouldShowError}
                            containerStyles={[!shouldShowError && styles.mt5]}
                            message={translate('common.error.pleaseSelectOne')}
                        />
                    }
                />
            )}
        </InteractiveStepWrapper>
    );
}

CardSelectionStep.displayName = 'CardSelectionStep';

export default CardSelectionStep;

import React, {useMemo} from 'react';
import {View} from 'react-native';
import type {ViewStyle} from 'react-native';
import Icon from '@components/Icon';
import {ChatBubbleCounter} from '@components/Icon/Expensicons';
import Text from '@components/Text';
import useOnyx from '@hooks/useOnyx';
import useResponsiveLayout from '@hooks/useResponsiveLayout';
import useStyleUtils from '@hooks/useStyleUtils';
import useTheme from '@hooks/useTheme';
import useThemeStyles from '@hooks/useThemeStyles';
import {getIOUActionForTransactionID} from '@libs/ReportActionsUtils';
import {isChatThread} from '@libs/ReportUtils';
import variables from '@styles/variables';
import ONYXKEYS from '@src/ONYXKEYS';
import type {Report} from '@src/types/onyx';
import type Transaction from '@src/types/onyx/Transaction';

const isReportUnread = ({lastReadTime = '', lastVisibleActionCreated = '', lastMentionedTime = ''}: Report): boolean =>
    lastReadTime < lastVisibleActionCreated || lastReadTime < (lastMentionedTime ?? '');

function ChatBubbleCell({transaction, containerStyles, isInSingleTransactionReport}: {transaction: Transaction; containerStyles?: ViewStyle[]; isInSingleTransactionReport?: boolean}) {
    const theme = useTheme();
    const styles = useThemeStyles();
    const {shouldUseNarrowLayout} = useResponsiveLayout();
    const [iouReportAction] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transaction.reportID}`, {
        selector: (reportActions) => getIOUActionForTransactionID(Object.values(reportActions ?? {}), transaction.transactionID),
        canBeMissing: true,
    });

    const [childReport] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT}${iouReportAction?.childReportID}`, {
        canBeMissing: true,
    });

    const [parentReport] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT}${transaction.reportID}`, {
        canBeMissing: false,
    });

    const transactionReport = isInSingleTransactionReport ? parentReport : childReport;

    const threadMessages = useMemo(
        () => ({
            count: (iouReportAction && iouReportAction?.childVisibleActionCount) ?? 0,
            isUnread: isChatThread(transactionReport) && isReportUnread(transactionReport),
        }),
        [iouReportAction, transactionReport],
    );

    const StyleUtils = useStyleUtils();

    const iconSize = shouldUseNarrowLayout ? variables.iconSizeSmall : variables.iconSizeNormal;
    const fontSize = shouldUseNarrowLayout ? variables.fontSizeXXSmall : variables.fontSizeExtraSmall;

    return (
        threadMessages.count > 0 && (
            <View style={[styles.dFlex, styles.alignItemsCenter, styles.justifyContentCenter, styles.textAlignCenter, StyleUtils.getWidthAndHeightStyle(iconSize), containerStyles]}>
                <Icon
                    src={ChatBubbleCounter}
                    additionalStyles={[styles.pAbsolute]}
                    fill={threadMessages.isUnread ? theme.iconMenu : theme.icon}
                    width={iconSize}
                    height={iconSize}
                />
                <Text
                    style={[
                        styles.textBold,
                        StyleUtils.getLineHeightStyle(variables.lineHeightXSmall),
                        StyleUtils.getColorStyle(theme.appBG),
                        StyleUtils.getFontSizeStyle(fontSize),
                        {top: -1},
                    ]}
                >
                    {threadMessages.count > 99 ? '99+' : threadMessages.count}
                </Text>
            </View>
        )
    );
}

ChatBubbleCell.displayName = 'ChatBubbleCell';

export default ChatBubbleCell;

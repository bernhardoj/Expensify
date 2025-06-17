import React, {useRef} from 'react';
import {useOnyx} from 'react-native-onyx';
import {FeatureTrainingModalHandle} from '@components/FeatureTrainingModal';
import useLocalize from '@hooks/useLocalize';
import Navigation from '@libs/Navigation/Navigation';
import {isAdminRoom} from '@libs/ReportUtils';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import BaseTestDriveModal from './BaseTestDriveModal';

function AdminTestDriveModal() {
    const {translate} = useLocalize();
    const [onboarding] = useOnyx(ONYXKEYS.NVP_ONBOARDING, {canBeMissing: false});
    const [onboardingReport] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT}${onboarding?.chatReportID}`, {canBeMissing: true});
    const modalRef = useRef<FeatureTrainingModalHandle>(null);
    const actionToPerformRef = useRef<'skip' | 'navigate'>();

    const navigate = () => {
        actionToPerformRef.current = 'navigate';
    };

    const skipTestDrive = () => {
        actionToPerformRef.current = 'skip';
        modalRef.current?.closeModal();
    };

    return (
        <BaseTestDriveModal
            ref={modalRef}
            description={translate('testDrive.modal.description')}
            onConfirm={navigate}
            onHelp={skipTestDrive}
            onModalHide={() => {
                switch (actionToPerformRef.current) {
                    case 'skip': {
                        if (!isAdminRoom(onboardingReport)) {
                            return;
                        }

                        Navigation.navigate(ROUTES.REPORT_WITH_ID.getRoute(onboardingReport?.reportID));
                    }
                    case 'navigate': Navigation.navigate(ROUTES.TEST_DRIVE_DEMO_ROOT);
                }
            }}
        />
    );
}

AdminTestDriveModal.displayName = 'AdminTestDriveModal';

export default AdminTestDriveModal;

import { useCallback } from 'react';
import { CaptureProtection, useCaptureProtection } from 'react-native-capture-protection';
import { isDesktop } from '../modules/environment';

export const useScreenProtect = () => {
  const { protectionStatus, status } = useCaptureProtection();

  // Stable identities: callers put these in a useFocusEffect/useCallback dependency array to
  // arm/disarm capture protection once per focus. A fresh function on every call here would
  // change that dependency on every render, tearing the focus effect down and re-running it far
  // more often than an actual focus change — see PleaseBackup.tsx's recovery-phrase screen.
  const enableScreenProtect = useCallback(() => {
    if (isDesktop) return;
    CaptureProtection.prevent();
  }, []);

  const disableScreenProtect = useCallback(async () => {
    if (isDesktop) return;
    await CaptureProtection.allow();
  }, []);

  const isScreenBeingRecorded = useCallback(async () => {
    if (isDesktop) return false;
    return await CaptureProtection.isScreenRecording();
  }, []);

  return {
    enableScreenProtect,
    disableScreenProtect,
    isScreenBeingRecorded,
    protectionStatus,
    status,
  };
};

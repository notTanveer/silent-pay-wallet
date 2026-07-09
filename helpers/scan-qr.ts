import { Platform } from 'react-native';
import { check, request, PERMISSIONS, PermissionStatus } from 'react-native-permissions';
import { navigationRef } from '../NavigationService';

const CAMERA_PERMISSION = Platform.OS === 'android' ? PERMISSIONS.ANDROID.CAMERA : PERMISSIONS.IOS.CAMERA;

const getCameraAuthorizationStatus = (): Promise<PermissionStatus> => check(CAMERA_PERMISSION);

// Only call this when the status is DENIED (i.e. still requestable). On Android a
// permanently-denied (BLOCKED) permission makes request() hang forever — no system
// dialog is shown and its promise never resolves — which strands the caller.
const requestCameraAuthorization = () => {
  return request(CAMERA_PERMISSION);
};

const scanQrHelper = async (): Promise<string> => {
  // Do NOT request camera permission here. Presenting the ScanQRCode modal in the same
  // tick as the permission alert races the alert's dismissal against the modal's
  // presentation and wedges UIKit's modal stack (a queued presentation then surfaces at
  // the next native-modal dismissal). ScanQRCode requests permission itself once presented.
  return new Promise(resolve => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('ScanQRCode', {
        showFileImportButton: true,
        onBarScanned: (data: string) => {
          resolve(data);
        },
      });
    }
  });
};

export { getCameraAuthorizationStatus, requestCameraAuthorization, scanQrHelper };

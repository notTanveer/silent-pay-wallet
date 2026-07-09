import { RouteProp, StackActions, useIsFocused, useRoute } from '@react-navigation/native';
import * as bitcoin from 'bitcoinjs-lib';
import { sha256 } from '@noble/hashes/sha256';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Base43 from '../../modules/base43';
import * as fs from '../../modules/fs';
import { BlueURDecoder, decodeUR, extractSingleWorkload } from '../../modules/ur';
import { ShroudText } from '../../ShroudComponents';
import { openPrivacyDesktopSettings } from '../../class/camera';
import Button from '../../components/Button';
import { useTheme } from '../../components/themes';
import { getCameraAuthorizationStatus, requestCameraAuthorization } from '../../helpers/scan-qr';
import { RESULTS } from 'react-native-permissions';
import loc from '../../loc';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import CameraScreen from '../../components/CameraScreen';
import SafeArea from '../../components/SafeArea';
import presentAlert from '../../components/Alert';
import { SendDetailsStackParamList } from '../../navigation/SendDetailsStackParamList.ts';
import { Loading } from '../../components/Loading.tsx';
import { ClashFont } from '../../constants/fonts';
import CameraIcon from '../../components/icons/CameraIcon';

let decoder: BlueURDecoder | undefined;

type RouteProps = RouteProp<SendDetailsStackParamList, 'ScanQRCode'>;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permissionContainer: {
    height: '100%',
    paddingHorizontal: 24,
  },
  permissionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionTitle: {
    fontFamily: ClashFont.medium,
    fontSize: 18,
    lineHeight: 26,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  permissionActions: {
    gap: 12,
    paddingBottom: 8,
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: ClashFont.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  secondaryButton: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: ClashFont.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  ghostButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: {
    fontFamily: ClashFont.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  cameraLoading: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  backdoorButton: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(0,0,0,0.01)',
    position: 'absolute',
    top: 60,
    left: '50%',
    transform: [{ translateX: -30 }],
  },
  backdoorInputWrapper: { position: 'absolute', left: '5%', top: '0%', width: '90%', height: '70%', backgroundColor: 'white' },
  progressWrapper: { position: 'absolute', alignSelf: 'center', alignItems: 'center', top: '50%', padding: 8, borderRadius: 8 },
  backdoorInput: {
    height: '50%',
    marginTop: 5,
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 4,
    textAlignVertical: 'top',
  },
});

const ScanQRCode = () => {
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useExtendedNavigation();
  const route = useRoute<RouteProps>();
  const navigationState = navigation.getState();
  const previousRoute = navigationState.routes[navigationState.routes.length - 2];
  const defaultLaunchedBy = previousRoute ? previousRoute.name : undefined;

  const { launchedBy = defaultLaunchedBy, showFileImportButton, onBarScanned } = route.params || {};
  const scannedCache: Record<string, number> = {};
  const { colors } = useTheme();
  const isFocused = useIsFocused();
  const [backdoorPressed, setBackdoorPressed] = useState(0);
  const [urTotal, setUrTotal] = useState(0);
  const [urHave, setUrHave] = useState(0);
  const [backdoorText, setBackdoorText] = useState('');
  const [backdoorVisible, setBackdoorVisible] = useState(false);
  const [animatedQRCodeData, setAnimatedQRCodeData] = useState<Record<string, string>>({});
  const [cameraStatusGranted, setCameraStatusGranted] = useState<boolean | undefined>(undefined);
  const stylesHook = StyleSheet.create({
    rootElevated: { backgroundColor: colors.elevated },
    iconCircle: { backgroundColor: colors.surfaceSubtle },
    permissionTitle: { color: colors.foregroundColor },
    primaryButton: { backgroundColor: colors.brandPrimary },
    primaryButtonText: { color: colors.white },
    secondaryButton: { backgroundColor: colors.accentSubtle },
    secondaryButtonText: { color: colors.brandPrimary },
    ghostButtonText: { color: colors.alternativeTextColor },
    progressWrapper: { backgroundColor: colors.brandingColor, borderColor: colors.foregroundColor, borderWidth: 4 },
    backdoorInput: {
      borderColor: colors.formBorder,
      borderBottomColor: colors.formBorder,
      backgroundColor: colors.inputBackgroundColor,
      color: colors.foregroundColor,
    },
  });

  useEffect(() => {
    let active = true;
    (async () => {
      // Resolve permission from within the presented modal. Requesting before navigating
      // (the old behaviour) raced the iOS permission alert against this modal's
      // presentation and wedged UIKit's modal stack.
      const status = await getCameraAuthorizationStatus();
      if (!active) return;

      if (status === RESULTS.GRANTED) {
        setCameraStatusGranted(true);
        return;
      }
      if (status !== RESULTS.DENIED) {
        // BLOCKED / UNAVAILABLE / LIMITED: not requestable — show the fallback directly.
        // Never call request() here: on Android a permanently-denied permission makes it
        // hang forever (no OS prompt, no callback), stranding the screen.
        setCameraStatusGranted(false);
        return;
      }

      // DENIED — usually requestable, but Android's check() also reports DENIED for some
      // permanently-denied states where request() then hangs. So don't block on it:
      // honour the result if/when it arrives, and after a short grace period drop to the
      // fallback so the screen is never stuck on a spinner ("black screen").
      requestCameraAuthorization()
        .then(result => active && setCameraStatusGranted(result === RESULTS.GRANTED))
        .catch(() => active && setCameraStatusGranted(false));
      setTimeout(() => {
        if (active) setCameraStatusGranted(prev => (prev === undefined ? false : prev));
      }, 800);
    })();
    return () => {
      active = false;
    };
  }, []);

  const HashIt = function (s: string): string {
    return Buffer.from(sha256(s)).toString('hex');
  };

  const _onReadUniformResourceV2 = (part: string) => {
    if (!decoder) decoder = new BlueURDecoder();
    try {
      decoder.receivePart(part);
      if (decoder.isComplete()) {
        const data = decoder.toString();
        decoder = undefined; // nullify for future use (?)
        if (launchedBy) {
          const merge = true;
          const popToAction = StackActions.popTo(launchedBy, { onBarScanned: data }, { merge });
          if (onBarScanned) {
            onBarScanned(data);
          }

          navigation.dispatch(popToAction);
        }
      } else {
        setUrTotal(100);
        setUrHave(Math.floor(decoder.estimatedPercentComplete() * 100));
      }
    } catch (error) {
      setIsLoading(true);
      presentAlert({
        title: loc.errors.error,
        message: loc._.invalid_animated_qr_code_fragment,
      });
    }
  };

  /**
   *
   * @deprecated remove when we get rid of URv1 support
   */
  const _onReadUniformResource = (ur: string) => {
    try {
      const [index, total] = extractSingleWorkload(ur);
      animatedQRCodeData[index + 'of' + total] = ur;
      setUrTotal(total);
      setUrHave(Object.values(animatedQRCodeData).length);
      if (Object.values(animatedQRCodeData).length === total) {
        const payload = decodeUR(Object.values(animatedQRCodeData));
        // lets look inside that data
        let data: false | string = false;
        if (Buffer.from(String(payload), 'hex').toString().startsWith('psbt')) {
          // its a psbt, and whoever requested it expects it encoded in base64
          data = Buffer.from(String(payload), 'hex').toString('base64');
        } else {
          // its something else. probably plain text is expected
          data = Buffer.from(String(payload), 'hex').toString();
        }
        if (launchedBy) {
          const merge = true;
          const popToAction = StackActions.popTo(launchedBy, { onBarScanned: data }, { merge });
          if (onBarScanned) {
            onBarScanned(data);
          }

          navigation.dispatch(popToAction);
        }
      } else {
        setAnimatedQRCodeData(animatedQRCodeData);
      }
    } catch (error) {
      setIsLoading(true);

      presentAlert({
        title: loc.errors.error,
        message: loc._.invalid_animated_qr_code_fragment,
      });
    }
  };

  const onBarCodeRead = (ret: { data: string }) => {
    const h = HashIt(ret.data);
    if (scannedCache[h]) {
      // this QR was already scanned by this ScanQRCode, lets prevent firing duplicate callbacks
      return;
    }
    scannedCache[h] = +new Date();

    if (ret.data.toUpperCase().startsWith('UR:CRYPTO-ACCOUNT')) {
      return _onReadUniformResourceV2(ret.data);
    }

    if (ret.data.toUpperCase().startsWith('UR:CRYPTO-PSBT')) {
      return _onReadUniformResourceV2(ret.data);
    }

    if (ret.data.toUpperCase().startsWith('UR:CRYPTO-OUTPUT')) {
      return _onReadUniformResourceV2(ret.data);
    }

    if (ret.data.toUpperCase().startsWith('UR:BYTES')) {
      const splitted = ret.data.split('/');
      if (splitted.length === 3 && splitted[1].includes('-')) {
        return _onReadUniformResourceV2(ret.data);
      }
    }

    if (ret.data.toUpperCase().startsWith('UR')) {
      return _onReadUniformResource(ret.data);
    }

    // is it base43? stupid electrum desktop
    try {
      const hex = Base43.decode(ret.data);
      bitcoin.Psbt.fromHex(hex); // if it doesnt throw - all good
      const data = Buffer.from(hex, 'hex').toString('base64');

      if (launchedBy) {
        const merge = true;
        const popToAction = StackActions.popTo(launchedBy, { onBarScanned: data }, { merge });
        if (onBarScanned) {
          onBarScanned(data);
        }
        navigation.dispatch(popToAction);
      }
      return;
    } catch (_) {
      if (!isLoading && launchedBy) {
        setIsLoading(true);
        try {
          const merge = true;

          const popToAction = StackActions.popTo(launchedBy, { onBarScanned: ret.data }, { merge });
          if (onBarScanned) {
            onBarScanned(ret.data);
          }

          navigation.dispatch(popToAction);
        } catch (e) {
          console.log(e);
        }
      }
    }
    setIsLoading(false);
  };

  const showFilePicker = async () => {
    setIsLoading(true);
    const { data } = await fs.showFilePickerAndReadFile();
    if (data) onBarCodeRead({ data });
    setIsLoading(false);
  };

  const onShowImagePickerButtonPress = () => {
    if (!isLoading) {
      setIsLoading(true);
      fs.showImagePickerAndReadImage()
        .then(data => {
          if (data) onBarCodeRead({ data });
        })
        .catch(error => {
          presentAlert({ title: loc.errors.error, message: error.message });
        })
        .finally(() => setIsLoading(false));
    }
  };

  const dismiss = () => {
    navigation.goBack();
  };

  const handleReadCode = (event: any) => {
    onBarCodeRead({ data: event?.nativeEvent?.codeStringValue });
  };

  const handleBackdoorOkPress = () => {
    setBackdoorVisible(false);
    setBackdoorText('');
    if (backdoorText) onBarCodeRead({ data: backdoorText });
  };

  // this is an invisible backdoor button on bottom left screen corner
  // tapping it 10 times fires prompt dialog asking for a string thats gona be passed to onBarCodeRead.
  // this allows to mock and test QR scanning in e2e tests
  const handleInvisibleBackdoorPress = async () => {
    setBackdoorPressed(backdoorPressed + 1);
    if (backdoorPressed < 5) return;
    setBackdoorPressed(0);
    setBackdoorVisible(true);
  };

  const render = isLoading ? (
    <Loading />
  ) : (
    <View>
      {cameraStatusGranted === false ? (
        <View style={styles.permissionContainer}>
          <View style={styles.permissionContent}>
            <View style={[styles.iconCircle, stylesHook.iconCircle]}>
              <CameraIcon color={colors.brandPrimary} size={32} />
            </View>
            <ShroudText style={[styles.permissionTitle, stylesHook.permissionTitle]}>{loc.send.permission_camera_message}</ShroudText>
          </View>
          <View style={styles.permissionActions}>
            <Pressable
              accessibilityRole="button"
              onPress={openPrivacyDesktopSettings}
              style={({ pressed }) => [styles.primaryButton, stylesHook.primaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={[styles.primaryButtonText, stylesHook.primaryButtonText]}>{loc.send.open_settings}</Text>
            </Pressable>
            {showFileImportButton && (
              <Pressable
                accessibilityRole="button"
                onPress={showFilePicker}
                style={({ pressed }) => [styles.secondaryButton, stylesHook.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={[styles.secondaryButtonText, stylesHook.secondaryButtonText]}>{loc.wallets.import_file}</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={onShowImagePickerButtonPress}
              style={({ pressed }) => [styles.secondaryButton, stylesHook.secondaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={[styles.secondaryButtonText, stylesHook.secondaryButtonText]}>{loc.wallets.list_long_choose}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={dismiss}
              style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]}
            >
              <Text style={[styles.ghostButtonText, stylesHook.ghostButtonText]}>{loc._.cancel}</Text>
            </Pressable>
          </View>
        </View>
      ) : isFocused && cameraStatusGranted ? (
        <CameraScreen
          onReadCode={handleReadCode}
          showFilePickerButton={showFileImportButton}
          showImagePickerButton={true}
          onFilePickerButtonPress={showFilePicker}
          onImagePickerButtonPress={onShowImagePickerButtonPress}
          onCancelButtonPress={dismiss}
        />
      ) : (
        // Permission still resolving (checking status / awaiting the OS prompt). Show a
        // spinner rather than the bare black root so the screen behind the permission
        // dialog doesn't read as a broken "black screen".
        <View style={styles.cameraLoading}>
          <Loading color="#ffffff" />
        </View>
      )}
      {urTotal > 0 && (
        <View style={[styles.progressWrapper, stylesHook.progressWrapper]} testID="UrProgressBar">
          <ShroudText>{loc.wallets.please_continue_scanning}</ShroudText>
          <ShroudText>
            {urHave} / {urTotal}
          </ShroudText>
        </View>
      )}
      {backdoorVisible && (
        <View style={styles.backdoorInputWrapper}>
          <ShroudText>Provide QR code contents manually:</ShroudText>
          <TextInput
            testID="scanQrBackdoorInput"
            multiline
            underlineColorAndroid="transparent"
            style={[styles.backdoorInput, stylesHook.backdoorInput]}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            selectTextOnFocus={false}
            keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
            value={backdoorText}
            onChangeText={setBackdoorText}
          />
          <Button title="OK" testID="scanQrBackdoorOkButton" onPress={handleBackdoorOkPress} />
        </View>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={loc._.qr_custom_input_button}
        testID="ScanQrBackdoorButton"
        style={styles.backdoorButton}
        onPress={handleInvisibleBackdoorPress}
      />
    </View>
  );

  return <SafeArea style={[styles.root, cameraStatusGranted === false ? stylesHook.rootElevated : null]}>{render}</SafeArea>;
};

export default ScanQRCode;

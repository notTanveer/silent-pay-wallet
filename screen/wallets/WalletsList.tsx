import React, { useCallback, useEffect, useReducer, useRef, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import useAppState from '../../hooks/useAppState';
import ScanProgressBar from '../../components/ScanProgressBar';
import { useScannableWallet } from '../../hooks/useScannableWallet';
import { Alert, Animated, InteractionManager, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import A from '../../modules/analytics';
import { getClipboardContent } from '../../modules/clipboard';
import { isDesktop } from '../../modules/environment';
import * as fs from '../../modules/fs';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../modules/hapticFeedback';
import DeeplinkSchemaMatch from '../../class/deeplink-schema-match';
import { ExtendedTransaction, Transaction, TWallet } from '../../class/wallets/types';
import presentAlert from '../../components/Alert';
import { useTheme } from '../../components/themes';
import { TransactionListItem } from '../../components/TransactionListItem';
import { useSizeClass, SizeClass } from '../../modules/sizeClass';
import loc, { formatBalanceWithoutSuffix } from '../../loc';
import { BitcoinUnit } from '../../models/bitcoinUnits';
import ActionSheet from '../ActionSheet';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DetailViewStackParamList } from '../../navigation/DetailViewStackParamList';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import { useStorage } from '../../hooks/context/useStorage';
import { useSettings } from '../../hooks/context/useSettings';
import SafeAreaSectionList from '../../components/SafeAreaSectionList';
import { scanQrHelper } from '../../helpers/scan-qr.ts';
import QRScanIcon from '../../components/icons/QRScanIcon';
import { ClashFont } from '../../constants/fonts';
import { satoshiToLocalCurrency } from '../../modules/currency';
import SearchIcon from '../../components/icons/SearchIcon';
import ShieldReceiveIcon from '../../components/icons/ShieldReceiveIcon';
import ReceiveArrowIcon from '../../components/icons/ReceiveArrowIcon';
import PayArrowIcon from '../../components/icons/PayArrowIcon';
import ChevronRightIcon from '../../components/icons/ChevronRightIcon';

const WalletsListSections = { WALLET: 'WALLET', TRANSACTIONS: 'TRANSACTIONS' };

type SectionData = {
  key: string;
  data: Transaction[] | string[];
};

enum ActionTypes {
  SET_LOADING,
  SET_WALLETS,
  SET_CURRENT_INDEX,
  SET_REFRESH_FUNCTION,
}

interface SetLoadingAction {
  type: ActionTypes.SET_LOADING;
  payload: boolean;
}

interface SetWalletsAction {
  type: ActionTypes.SET_WALLETS;
  payload: TWallet[];
}

interface SetCurrentIndexAction {
  type: ActionTypes.SET_CURRENT_INDEX;
  payload: number;
}

interface SetRefreshFunctionAction {
  type: ActionTypes.SET_REFRESH_FUNCTION;
  payload: () => void;
}

type WalletListAction = SetLoadingAction | SetWalletsAction | SetCurrentIndexAction | SetRefreshFunctionAction;

interface WalletListState {
  isLoading: boolean;
  wallets: TWallet[];
  currentWalletIndex: number;
  refreshFunction: () => void;
}

const initialState = {
  isLoading: false,
  wallets: [],
  currentWalletIndex: 0,
  refreshFunction: () => {},
};

function reducer(state: WalletListState, action: WalletListAction) {
  switch (action.type) {
    case ActionTypes.SET_LOADING:
      return { ...state, isLoading: action.payload };
    case ActionTypes.SET_WALLETS:
      return { ...state, wallets: action.payload };
    case ActionTypes.SET_CURRENT_INDEX:
      return { ...state, currentWalletIndex: action.payload };
    case ActionTypes.SET_REFRESH_FUNCTION:
      return { ...state, refreshFunction: action.payload };
    default:
      return state;
  }
}

type NavigationProps = NativeStackNavigationProp<DetailViewStackParamList, 'WalletsList'>;

const WalletsList: React.FC = () => {
  const [state, dispatch] = useReducer<React.Reducer<WalletListState, WalletListAction>>(reducer, initialState);
  const { isLoading } = state;
  const { sizeClass, isLarge } = useSizeClass();
  const { wallets, getTransactions, getBalance, refreshAllWalletTransactions, saveToDisk, scanState } = useStorage();
  const { isElectrumDisabled } = useSettings();
  const { currentAppState } = useAppState();
  const wasAutoPausedRef = useRef(false);
  const { colors } = useTheme();
  const navigation = useExtendedNavigation<NavigationProps>();
  const dataSource = getTransactions(undefined, Infinity);
  const walletsCount = useRef<number>(wallets.length);
  const [showZeroBalanceToast, setShowZeroBalanceToast] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const dismissToast = useCallback(() => {
    Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setShowZeroBalanceToast(false);
    });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, [toastOpacity]);

  const triggerZeroBalanceToast = useCallback(() => {
    setShowZeroBalanceToast(true);
    Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(dismissToast, 4000);
  }, [toastOpacity, dismissToast]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const stylesHook = useMemo(
    () => ({
      listHeaderBack: {
        backgroundColor: colors.background,
        paddingTop: sizeClass === SizeClass.Large ? 8 : 0,
      },
      walletContainer: {
        backgroundColor: colors.background,
      },
      trackPaymentBg: {
        backgroundColor: colors.bannerBackground,
        borderColor: colors.bannerBorderColor,
      },
      receiveBtnStyle: {
        backgroundColor: colors.receiveBtnBackground,
        borderColor: colors.requestBtnBorderColor,
      },
      scanBtnStyle: {
        backgroundColor: colors.background,
        borderColor: colors.scanBtnBorderColor,
        borderWidth: 1,
      },
      payBtnActive: {
        backgroundColor: colors.buttonBackgroundColor,
      },
      payBtnDisabled: {
        backgroundColor: colors.payBtnDisabledBackground,
      },
      cardStyle: {
        backgroundColor: colors.elevated,
        borderColor: colors.lightBorder,
      },
      emptyCardStyle: {
        backgroundColor: colors.emptyCardBackground,
        borderColor: colors.lightBorder,
      },
      foregroundText: {
        color: colors.foregroundColor,
      },
      alternativeText: {
        color: colors.alternativeTextColor,
      },
      requestBtnLabel: {
        color: colors.requestBtnTextColor,
      },
      payBtnLabel: {
        color: colors.payBtnTextColor,
      },
      toastRequestBtn: {
        backgroundColor: colors.buttonBackgroundColor,
      },
      shareAddrStyle: {
        borderWidth: 1.63,
        borderColor: colors.shareAddrBorderColor,
        backgroundColor: colors.shareAddrBackground,
      },
      shareAddrText: {
        color: colors.requestBtnTextColor,
      },
      zeroBalanceRequestText: {
        color: colors.zeroBalanceRequestTextColor,
      },
    }),
    [colors, sizeClass],
  );

  const refreshWallets = useCallback(
    async (index: number | undefined, showLoadingIndicator = true, showUpdateStatusIndicator = false) => {
      if (isElectrumDisabled) return;
      dispatch({ type: ActionTypes.SET_LOADING, payload: showLoadingIndicator });
      try {
        await refreshAllWalletTransactions(index, showUpdateStatusIndicator);
      } catch (error) {
        console.error(error);
      } finally {
        dispatch({ type: ActionTypes.SET_LOADING, payload: false });
      }
    },
    [isElectrumDisabled, refreshAllWalletTransactions],
  );

  /**
   * Forcefully fetches TXs and balance for ALL wallets.
   * Triggered manually by user on pull-to-refresh.
   */
  const refreshTransactions = useCallback(() => {
    refreshWallets(undefined, true, true);
  }, [refreshWallets]);

  useEffect(() => {
    // Initial load of transactions without triggering scroll
    const initialLoad = async () => {
      if (isElectrumDisabled) return;
      try {
        await refreshAllWalletTransactions(undefined, true);
      } catch (error) {
        console.error(error);
      }
    };

    initialLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(() => {
    console.debug('WalletsList onRefresh');
    refreshTransactions();
    // Optimized for Mac option doesn't like RN Refresh component. Menu Elements now handles it for macOS
  }, [refreshTransactions]);

  const verifyBalance = useCallback(() => {
    if (getBalance() !== 0) {
      A(A.ENUM.GOT_NONZERO_BALANCE);
    } else {
      A(A.ENUM.GOT_ZERO_BALANCE);
    }
  }, [getBalance]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        verifyBalance();
      });

      return () => {
        task.cancel();
      };
    }, [verifyBalance]),
  );

  useEffect(() => {
    // new wallet added - no longer auto-scrolls
    if (!isLarge) {
      // Just update the count, no scrolling
      walletsCount.current = wallets.length;
    }
  }, [isLarge, wallets]);

  const scanWallet = useScannableWallet();

  useEffect(() => {
    if (!scanWallet) return;
    const isBackground = currentAppState === 'background' || currentAppState === 'inactive';
    if (isBackground && scanState.status === 'scanning') {
      wasAutoPausedRef.current = true;
      scanWallet.pauseScan();
    } else if (!isBackground && wasAutoPausedRef.current && scanState.status === 'paused') {
      wasAutoPausedRef.current = false;
      scanWallet.resumeScan();
    } else if (scanState.status !== 'paused' && scanState.status !== 'scanning') {
      // scan ended via another path (cancel/error/completion) — drop the stale flag so a
      // later manual pause isn't auto-resumed
      wasAutoPausedRef.current = false;
    }
  }, [currentAppState, scanState.status, scanWallet]);

  const onBarScanned = useCallback(
    (value: any) => {
      if (!value) return;
      try {
        DeeplinkSchemaMatch.navigationRouteFor({ url: value }, completionValue => {
          triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
          // @ts-ignore: for now
          navigation.navigate(...completionValue);
        });
      } catch (e: any) {
        Alert.alert(loc.errors.error, e.message);
      }
    },
    [navigation],
  );

  const renderListHeaderComponent = useCallback(() => {
    const wallet = wallets.length > 0 ? wallets[0] : null;
    return (
      <View style={[styles.listHeaderBack, stylesHook.listHeaderBack]}>
        {wallet && (
          <TouchableOpacity
            style={[styles.trackPaymentBanner, stylesHook.trackPaymentBg]}
            onPress={() => navigation.navigate('TrackPayment')}
            activeOpacity={0.7}
            testID="TrackPaymentBanner"
          >
            <View style={styles.trackPaymentIconCircle}>
              <SearchIcon size={48} background={colors.searchIconBackground} stroke={colors.searchIconStroke} />
            </View>
            <View style={styles.trackPaymentBannerContent}>
              <Text style={[styles.trackPaymentBannerTitle, stylesHook.foregroundText]}>{loc.track_payment.banner_title}</Text>
              <Text style={[styles.trackPaymentBannerSubtitle, stylesHook.alternativeText]}>{loc.track_payment.banner_subtitle}</Text>
            </View>
            <ChevronRightIcon color={colors.chevron} />
          </TouchableOpacity>
        )}
        {dataSource.length > 0 && <Text style={[styles.transactionsLabel, stylesHook.alternativeText]}>{loc.transactions.list_title}</Text>}
      </View>
    );
  }, [
    stylesHook.listHeaderBack,
    stylesHook.trackPaymentBg,
    stylesHook.foregroundText,
    stylesHook.alternativeText,
    navigation,
    wallets,
    dataSource.length,
    colors.searchIconBackground,
    colors.searchIconStroke,
    colors.chevron,
  ]);

  const renderTransactionListsRow = useCallback(
    (item: ExtendedTransaction) => (
      <TransactionListItem key={item.hash} item={item} itemPriceUnit={item.walletPreferredBalanceUnit} walletID={item.walletID} />
    ),
    [],
  );

  const changeWalletBalanceUnit = useCallback(async () => {
    const wallet = wallets.length > 0 ? wallets[0] : null;
    if (!wallet) return;

    let newWalletPreferredUnit = wallet.getPreferredBalanceUnit();

    switch (newWalletPreferredUnit) {
      case BitcoinUnit.BTC:
        newWalletPreferredUnit = BitcoinUnit.SATS;
        break;
      case BitcoinUnit.SATS:
      default:
        newWalletPreferredUnit = BitcoinUnit.BTC;
        break;
    }

    wallet.preferredBalanceUnit = newWalletPreferredUnit;
    await saveToDisk();
  }, [wallets, saveToDisk]);

  const onScanButtonPressed = useCallback(() => {
    scanQrHelper().then(onBarScanned);
  }, [onBarScanned]);

  const onSendButtonPressed = useCallback(() => {
    if (wallets.length > 0) {
      const wallet = wallets[0];
      navigation.navigate('SendDetailsRoot', {
        walletID: wallet.getID(),
      });
    }
  }, [navigation, wallets]);

  const onReceiveButtonPressed = useCallback(() => {
    if (wallets.length > 0) {
      const wallet = wallets[0];
      navigation.navigate('ReceiveDetails', {
        walletID: wallet.getID(),
        address: '',
      });
    }
  }, [navigation, wallets]);

  const onZeroBalanceRequestPress = useCallback(() => {
    dismissToast();
    onReceiveButtonPressed();
  }, [dismissToast, onReceiveButtonPressed]);

  const pasteFromClipboard = useCallback(async () => {
    onBarScanned(await getClipboardContent());
  }, [onBarScanned]);

  const sendButtonLongPress = useCallback(async () => {
    const isClipboardEmpty = (await getClipboardContent())?.trim().length === 0;

    const options = [loc._.cancel, loc.wallets.list_long_choose, loc.wallets.list_long_scan];
    if (!isClipboardEmpty) {
      options.push(loc.wallets.paste_from_clipboard);
    }

    const props = { title: loc.send.header, options, cancelButtonIndex: 0 };

    ActionSheet.showActionSheetWithOptions(props, buttonIndex => {
      switch (buttonIndex) {
        case 0:
          break;
        case 1:
          fs.showImagePickerAndReadImage()
            .then(onBarScanned)
            .catch(error => {
              triggerHapticFeedback(HapticFeedbackTypes.NotificationError);
              presentAlert({ title: loc.errors.error, message: error.message });
            });
          break;
        case 2:
          scanQrHelper().then(onBarScanned);
          break;
        case 3:
          if (!isClipboardEmpty) {
            pasteFromClipboard();
          }
          break;
      }
    });
  }, [onBarScanned, pasteFromClipboard]);

  const renderWalletItem = useCallback(() => {
    const wallet = wallets.length > 0 ? wallets[0] : null;
    if (!wallet) return null;

    const balance = wallet.getBalance();
    const preferredUnit = wallet.getPreferredBalanceUnit();
    const displayNum = String(formatBalanceWithoutSuffix(balance, preferredUnit, true));
    const fiatLine = `≈ ${satoshiToLocalCurrency(balance)}`;
    const hasBalance = balance > 0;

    return (
      <View style={[styles.walletSection, stylesHook.walletContainer]}>
        <TouchableOpacity onPress={changeWalletBalanceUnit} style={styles.balanceHeader}>
          <View style={styles.balanceRow}>
            <Text style={[styles.balanceNumber, stylesHook.foregroundText]} adjustsFontSizeToFit numberOfLines={1}>
              {displayNum}
            </Text>
            <Text style={[styles.balanceUnit, stylesHook.alternativeText]}>{preferredUnit}</Text>
          </View>
          <Text style={[styles.balanceFiat, stylesHook.alternativeText]}>{fiatLine}</Text>
        </TouchableOpacity>

        {scanWallet && <ScanProgressBar scanState={scanState} onResume={() => scanWallet.resumeScan()} />}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtnWide, stylesHook.receiveBtnStyle]}
            onPress={onReceiveButtonPressed}
            testID="HomeScreenReceiveButton"
            accessibilityRole="button"
          >
            <ReceiveArrowIcon color={colors.requestBtnTextColor} size={28} />
            <Text style={[styles.actionBtnLabel, stylesHook.requestBtnLabel]}>{loc.wallets.request_button}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtnSquare, stylesHook.scanBtnStyle]}
            onPress={onScanButtonPressed}
            testID="HomeScreenScanButton"
            accessibilityRole="button"
            accessibilityLabel={loc.wallets.scan_qr_code}
          >
            <QRScanIcon color={colors.buttonBackgroundColor} size={22} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtnWide, styles.actionBtnNoBorder, hasBalance ? stylesHook.payBtnActive : stylesHook.payBtnDisabled]}
            onPress={hasBalance ? onSendButtonPressed : triggerZeroBalanceToast}
            onLongPress={hasBalance ? sendButtonLongPress : undefined}
            testID="HomeScreenSendButton"
            accessibilityRole="button"
            accessibilityHint={hasBalance ? undefined : loc.wallets.no_balance_hint}
          >
            <PayArrowIcon color={colors.payBtnTextColor} size={28} />
            <Text style={[styles.actionBtnLabel, stylesHook.payBtnLabel]}>{loc.wallets.pay_button}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [
    wallets,
    stylesHook,
    colors,
    changeWalletBalanceUnit,
    scanWallet,
    scanState,
    triggerZeroBalanceToast,
    onReceiveButtonPressed,
    onScanButtonPressed,
    onSendButtonPressed,
    sendButtonLongPress,
  ]);

  const renderSectionItem = useCallback(
    (item: { section: any; item: ExtendedTransaction }) => {
      switch (item.section.key) {
        case WalletsListSections.WALLET:
          return sizeClass === SizeClass.Large ? null : renderWalletItem();
        case WalletsListSections.TRANSACTIONS:
          return renderTransactionListsRow(item.item);
        default:
          return null;
      }
    },
    [sizeClass, renderTransactionListsRow, renderWalletItem],
  );

  const renderSectionHeader = useCallback(
    (section: { section: { key: any } }) => {
      if (sizeClass === SizeClass.Large) {
        return null;
      }

      switch (section.section.key) {
        case WalletsListSections.TRANSACTIONS:
          return renderListHeaderComponent();
        default:
          return null;
      }
    },
    [sizeClass, renderListHeaderComponent],
  );

  const renderEmptyCard = useCallback(() => {
    if (dataSource.length !== 0 || isLoading) return null;
    const wallet = wallets.length > 0 ? wallets[0] : null;
    return (
      <View style={[styles.emptyCard, stylesHook.emptyCardStyle]} testID="NoTransactionsMessage">
        <View style={styles.emptyIconOuter}>
          <ShieldReceiveIcon
            size={94}
            background={colors.shieldIconBackground}
            borderColor={colors.shieldIconBorder}
            accent={colors.shieldIconAccent}
          />
        </View>
        <Text style={[styles.emptyTitle, stylesHook.foregroundText]}>{loc.wallets.no_transactions_title}</Text>
        <Text style={[styles.emptySubtitle, stylesHook.alternativeText]}>{loc.wallets.no_transactions_subtitle}</Text>
        {wallet && (
          <TouchableOpacity
            style={[styles.shareAddressButton, stylesHook.shareAddrStyle]}
            onPress={() => navigation.navigate('ReceiveDetails', { walletID: wallet.getID(), address: '' })}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={[styles.shareAddressText, stylesHook.shareAddrText]}>{loc.wallets.share_address}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [
    dataSource.length,
    isLoading,
    wallets,
    navigation,
    stylesHook.emptyCardStyle,
    stylesHook.foregroundText,
    stylesHook.alternativeText,
    stylesHook.shareAddrStyle,
    stylesHook.shareAddrText,
    colors.shieldIconBackground,
    colors.shieldIconBorder,
    colors.shieldIconAccent,
  ]);

  const sectionListKeyExtractor = useCallback((item: any, index: any) => {
    return `${item}${index}`;
  }, []);

  const refreshProps = isDesktop || isElectrumDisabled ? {} : { refreshing: isLoading, onRefresh };

  const sections: SectionData[] = useMemo(() => {
    // On large screens, only show transactions section
    if (sizeClass === SizeClass.Large) {
      return [{ key: WalletsListSections.TRANSACTIONS, data: dataSource }];
    }

    // On smaller screens, show both wallet and transactions
    return [
      { key: WalletsListSections.WALLET, data: [WalletsListSections.WALLET] },
      { key: WalletsListSections.TRANSACTIONS, data: dataSource },
    ];
  }, [sizeClass, dataSource]);

  return (
    <>
      <SafeAreaSectionList<any | string, SectionData>
        contentContainerStyle={styles.sectionListContent}
        renderItem={renderSectionItem}
        keyExtractor={sectionListKeyExtractor}
        renderSectionHeader={renderSectionHeader}
        initialNumToRender={10}
        ListFooterComponent={renderEmptyCard}
        ListFooterComponentStyle={styles.emptyCardOuter}
        sections={sections}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        ignoreTopInset={true} // Ignore top inset as the screen header already handles it
        {...refreshProps}
      />
      <Modal transparent visible={showZeroBalanceToast} statusBarTranslucent animationType="none" onRequestClose={dismissToast}>
        <View style={styles.toastModalOverlay} pointerEvents="box-none">
          <Animated.View testID="ZeroBalanceToast" style={[styles.zeroBalanceToast, stylesHook.cardStyle, { opacity: toastOpacity }]}>
            <View style={styles.zeroBalanceToastText}>
              <Text style={[styles.zeroBalanceToastTitle, stylesHook.foregroundText]}>{loc.wallets.zero_balance_toast_title}</Text>
              <Text style={[styles.zeroBalanceToastSubtitle, stylesHook.alternativeText]}>{loc.wallets.zero_balance_toast_subtitle}</Text>
            </View>
            <TouchableOpacity
              testID="ZeroBalanceToastRequestButton"
              style={[styles.toastRequestBtn, stylesHook.toastRequestBtn]}
              onPress={onZeroBalanceRequestPress}
              accessibilityRole="button"
            >
              <Text style={[styles.zeroBalanceRequestText, stylesHook.zeroBalanceRequestText]}>{loc.wallets.request_button}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
};

export default WalletsList;

const styles = StyleSheet.create({
  sectionListContent: {
    flexGrow: 1,
  },
  listHeaderBack: {
    flexDirection: 'column',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  walletSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  balanceHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  balanceNumber: {
    fontSize: 48,
    lineHeight: 48,
    letterSpacing: -1.2,
    textAlign: 'center',
    fontFamily: ClashFont.medium,
    flexShrink: 1,
  },
  balanceUnit: {
    fontSize: 22,
    marginLeft: 10,
    fontFamily: ClashFont.regular,
  },
  balanceFiat: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 6,
    fontFamily: ClashFont.regular,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  actionBtnWide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 60,
    borderRadius: 16,
    borderWidth: 1,
  },
  actionBtnNoBorder: {
    borderWidth: 0,
  },
  actionBtnSquare: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnLabel: {
    fontSize: 15,
    fontFamily: ClashFont.medium,
  },
  trackPaymentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    height: 80,
    gap: 12,
    marginBottom: 12,
  },
  trackPaymentIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackPaymentBannerContent: {
    flex: 1,
  },
  trackPaymentBannerTitle: {
    fontSize: 17,
    marginBottom: 3,
    fontFamily: ClashFont.medium,
  },
  trackPaymentBannerSubtitle: {
    fontSize: 13,
    fontFamily: ClashFont.regular,
  },
  transactionsLabel: {
    fontSize: 13,
    marginBottom: 8,
    marginTop: 4,
    fontFamily: ClashFont.regular,
  },
  emptyCardOuter: {
    flex: 1,
  },
  emptyCard: {
    flex: 1,
    margin: 16,
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
  },
  emptyIconOuter: {
    marginBottom: 37,
  },
  emptyTitle: {
    fontSize: 20,
    lineHeight: 32,
    letterSpacing: 0.07,
    textAlign: 'center',
    marginBottom: 23,
    fontFamily: ClashFont.medium,
  },
  emptySubtitle: {
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.08,
    textAlign: 'center',
    marginBottom: 30,
    fontFamily: ClashFont.regular,
  },
  shareAddressButton: {
    borderRadius: 16,
    height: 59,
    alignSelf: 'stretch',
    marginHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareAddressText: {
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.31,
    textAlign: 'center',
    fontFamily: ClashFont.medium,
  },
  toastModalOverlay: {
    flex: 1,
  },
  zeroBalanceToast: {
    position: 'absolute',
    top: 51,
    left: 23,
    right: 23,
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  zeroBalanceToastText: {
    flex: 1,
  },
  zeroBalanceToastTitle: {
    fontSize: 15,
    fontFamily: ClashFont.semibold,
    marginBottom: 2,
  },
  zeroBalanceToastSubtitle: {
    fontSize: 13,
    fontFamily: ClashFont.regular,
  },
  zeroBalanceRequestText: {
    fontSize: 15,
    fontFamily: ClashFont.medium,
  },
  toastRequestBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
});

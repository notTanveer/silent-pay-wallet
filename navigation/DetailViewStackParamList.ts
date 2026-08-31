import { Transaction, TWallet } from '../class/wallets/types';
import { OwnedOutput } from '../class/wallets/hd-bip352-wallet';
import { ElectrumServerItem } from '../modules/Electrum';
import { SendDetailsParams } from './SendDetailsStackParamList';
import { AddWalletStackParamList } from './AddWalletStack';

export type ScanQRCodeParamList = {
  cameraStatusGranted?: boolean;
  backdoorPressed?: boolean;
  launchedBy?: string;
  urTotal?: number;
  urHave?: number;
  backdoorText?: string;
  onBarScanned?: (data: string) => void;
  showFileImportButton?: boolean;
  backdoorVisible?: boolean;
  orientation?: 'portrait';
  animatedQRCodeData?: Record<string, any>;
};

export type DetailViewStackParamList = {
  DrawerRoot: undefined;
  UnlockWithScreen: undefined;
  WalletsList: { onBarScanned?: string };
  TransactionDetails: { tx: Transaction; hash: string; walletID: string };

  CPFP: {
    wallet: TWallet | null;
    txid: string;
  };
  RBFBumpFee: { txid: string; wallet: TWallet | null };
  RBFCancel: { txid: string; wallet: TWallet | null };
  Broadcast: object;
  Success: undefined;
  AddWalletRoot?: {
    screen?: keyof AddWalletStackParamList;
    params?: AddWalletStackParamList[keyof AddWalletStackParamList];
  };
  SendDetailsRoot: SendDetailsParams;
  WalletExportRoot: undefined;
  Settings: undefined;
  Currency: undefined;
  General: undefined;
  ThemeSettings: undefined;
  DenominationSettings: undefined;
  Contact: undefined;
  Tools: undefined;
  PlausibleDeniability: undefined;
  Licensing: undefined;
  About: undefined;
  ElectrumServerSettings: { server?: ElectrumServerItem };
  BlockExplorerSettings: undefined;
  TorSettings: undefined;
  NetworkSettings: undefined;
  EncryptStorage: undefined;
  SelfTest: undefined;
  ReceiveDetails: {
    walletID?: string;
    address: string;
  };
  ScanQRCode: ScanQRCodeParamList;
  Onboarding: undefined;
  TrackPayment: undefined;
  PaymentFound: { txid: string; outputs: OwnedOutput[]; totalValue: number; confirmations: number };
  NoPaymentFound: undefined;
  SyncScreen: undefined;
};

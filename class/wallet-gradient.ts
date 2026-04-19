import { useTheme } from '../components/themes';
import { HDLegacyP2PKHWallet } from './wallets/hd-legacy-p2pkh-wallet';
import { HDSegwitBech32Wallet } from './wallets/hd-segwit-bech32-wallet';
import { HDSegwitP2SHWallet } from './wallets/hd-segwit-p2sh-wallet';
import { LegacyWallet } from './wallets/legacy-wallet';
import { WatchOnlyWallet } from './wallets/watch-only-wallet';
import { HDSilentPaymentsWallet } from './wallets/hd-bip352-wallet';

export default class WalletGradient {
  static hdSegwitP2SHWallet: string[] = ['#007AFF', '#0040FF'];
  static hdSegwitBech32Wallet: string[] = ['#6CD9FC', '#44BEE5'];
  static watchOnlyWallet: string[] = ['#474646', '#282828'];
  static legacyWallet: string[] = ['#37E8C0', '#15BE98'];
  static hdLegacyP2PKHWallet: string[] = ['#FD7478', '#E73B40'];
  static defaultGradients: string[] = ['#B770F6', '#9013FE'];
  static silentPaymentsWallet: string[] = ['#FF9E3D', '#FF6A3D'];

  static createWallet = () => {
    const { colors } = useTheme();
    return colors.lightButton;
  };

  static gradientsFor(type: string): string[] {
    let gradient: string[];
    switch (type) {
      case HDSilentPaymentsWallet.type:
        gradient = WalletGradient.silentPaymentsWallet;
        break;
      case WatchOnlyWallet.type:
        gradient = WalletGradient.watchOnlyWallet;
        break;
      case LegacyWallet.type:
        gradient = WalletGradient.legacyWallet;
        break;
      case HDLegacyP2PKHWallet.type:
        gradient = WalletGradient.hdLegacyP2PKHWallet;
        break;
      case HDSegwitP2SHWallet.type:
        gradient = WalletGradient.hdSegwitP2SHWallet;
        break;
      case HDSegwitBech32Wallet.type:
        gradient = WalletGradient.hdSegwitBech32Wallet;
        break;
      default:
        gradient = WalletGradient.defaultGradients;
        break;
    }
    return gradient;
  }

  static linearGradientProps(type: string) {
    let props: any;
    switch (type) {
      default:
        break;
    }
    return props;
  }

  static headerColorFor(type: string): string {
    let gradient: string[];
    switch (type) {
      case HDSilentPaymentsWallet.type:
        gradient = WalletGradient.silentPaymentsWallet;
        break;
      case WatchOnlyWallet.type:
        gradient = WalletGradient.watchOnlyWallet;
        break;
      case LegacyWallet.type:
        gradient = WalletGradient.legacyWallet;
        break;
      case HDLegacyP2PKHWallet.type:
        gradient = WalletGradient.hdLegacyP2PKHWallet;
        break;
      case HDSegwitP2SHWallet.type:
        gradient = WalletGradient.hdSegwitP2SHWallet;
        break;
      case HDSegwitBech32Wallet.type:
        gradient = WalletGradient.hdSegwitBech32Wallet;
        break;
      default:
        gradient = WalletGradient.defaultGradients;
        break;
    }
    return gradient[0];
  }
}

import { Theme } from '../themes';
import { isIncomingTransaction } from '../../utils/transactionHelpers';

export interface TransactionIconColors {
  direction: 'incoming' | 'outgoing';
  haloBackground: string;
  haloBorder: string;
  background: string;
  borderColor: string;
  arrowColor: string;
}

export interface TransactionIconProps extends TransactionIconColors {
  size?: number;
}

export const getTransactionIconColors = (colors: Theme['colors'], value?: number): TransactionIconColors =>
  isIncomingTransaction(value)
    ? {
        direction: 'incoming',
        haloBackground: colors.background,
        haloBorder: colors.txIconHaloBorder,
        background: colors.incomingIconBackground,
        borderColor: colors.txIconHaloBorder,
        arrowColor: colors.brandPrimary,
      }
    : {
        direction: 'outgoing',
        haloBackground: colors.background,
        haloBorder: colors.txIconHaloBorder,
        background: colors.outgoingIconBackground,
        borderColor: colors.outgoingIconBorder,
        arrowColor: colors.foregroundColor,
      };

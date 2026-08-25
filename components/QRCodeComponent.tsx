import Clipboard from '@react-native-clipboard/clipboard';
import React, { useCallback, useRef } from 'react';
import { ImageSourcePropType, Platform, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Share from 'react-native-share';

import loc from '../loc';
import { ActionIcons } from '../typings/ActionIcons';
import { useTheme } from './themes';
import ToolTipMenu from './TooltipMenu';
import { Action } from './types';

interface QRCodeComponentProps {
  value: string;
  isMenuAvailable?: boolean;
  size?: number;
  ecl?: 'H' | 'Q' | 'M' | 'L';
  onError?: () => void;
  logo?: ImageSourcePropType;
  logoSize?: number;
  logoBackgroundColor?: string;
  logoBorderRadius?: number;
}

const actionIcons: { [key: string]: ActionIcons } = {
  Share: {
    iconValue: 'square.and.arrow.up',
  },
  Copy: {
    iconValue: 'doc.on.doc',
  },
};

const actionKeys = {
  Share: 'share',
  Copy: 'copy',
};

const menuActions: Action[] =
  Platform.OS === 'ios' || Platform.OS === 'macos'
    ? [
        {
          id: actionKeys.Copy,
          text: loc.transactions.details_copy,
          icon: actionIcons.Copy,
        },
        { id: actionKeys.Share, text: loc.receive.details_share, icon: actionIcons.Share },
      ]
    : [
        {
          id: actionKeys.Copy,
          text: loc.transactions.details_copy,
          icon: actionIcons.Copy,
        },
      ];

const QRCodeComponent: React.FC<QRCodeComponentProps> = ({
  value = '',
  isMenuAvailable = true,
  size = 300,
  ecl = 'H',
  onError = () => {},
  logo,
  logoSize,
  logoBackgroundColor,
  logoBorderRadius,
}) => {
  const { dark } = useTheme();
  const qrCode = useRef<any>();
  const setQrCodeRef = useCallback((c: any) => {
    qrCode.current = c;
  }, []);

  const handleShareQRCode = () => {
    qrCode.current.toDataURL((data: string) => {
      data = data.replace(/(\r\n|\n|\r)/gm, '');
      const shareImageBase64 = {
        url: `data:image/png;base64,${data}`,
      };
      Share.open(shareImageBase64).catch((error: Error) => console.log(error));
    });
  };

  const onPressMenuItem = useCallback((id: string) => {
    if (id === actionKeys.Share) {
      handleShareQRCode();
    } else if (id === actionKeys.Copy) {
      qrCode.current.toDataURL(Clipboard.setImage);
    }
  }, []);

  const renderQRCode = (
    <QRCode
      value={value}
      size={size}
      color={dark ? '#FFFFFF' : '#000000'}
      backgroundColor={dark ? '#000000' : '#FFFFFF'}
      ecl={ecl}
      getRef={setQrCodeRef}
      onError={onError}
      {...(logo ? { logo, logoSize, logoBackgroundColor, logoBorderRadius } : {})}
    />
  );

  return (
    <View
      testID="BitcoinAddressQRCodeContainer"
      accessibilityIgnoresInvertColors
      importantForAccessibility="no-hide-descendants"
      accessibilityRole="image"
      accessibilityLabel={loc.receive.qrcode_for_the_address}
    >
      {isMenuAvailable ? (
        <ToolTipMenu actions={menuActions} onPressMenuItem={onPressMenuItem}>
          {renderQRCode}
        </ToolTipMenu>
      ) : (
        renderQRCode
      )}
    </View>
  );
};

export default QRCodeComponent;

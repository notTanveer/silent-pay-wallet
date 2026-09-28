import { Platform } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { detectQRCodeInImage } from 'react-native-camera-kit-no-google';
import loc from '../loc';

// Shared by every "paste from clipboard" entry point: prefers a QR code decoded from a
// clipboard image (e.g. a copied seed-phrase screenshot) before falling back to clipboard
// text. Throws when an image was found but held no QR code.
export const readClipboardForPaste = async (): Promise<string> => {
  const hasImage = Platform.OS === 'android' ? true : await Clipboard.hasImage();
  const image = hasImage ? await Clipboard.getImage() : null;

  if (image) {
    const base64Data = image.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    const result = await detectQRCodeInImage(base64Data);
    if (result) return result;
    throw new Error(loc.send.qr_error_no_qrcode);
  }

  return Clipboard.getString();
};

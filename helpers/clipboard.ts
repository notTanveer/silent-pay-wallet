import { Platform } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { detectQRCodeInImage } from 'react-native-camera-kit-no-google';
import presentAlert from '../components/Alert';
import loc from '../loc';

// Shared by every "paste from clipboard" entry point: prefers a QR code decoded from a
// clipboard image (e.g. a copied seed-phrase screenshot) before falling back to clipboard
// text. Returns undefined when an image was found but held no QR code — the caller has
// already been alerted and should leave its input untouched.
export const readClipboardForPaste = async (): Promise<string | undefined> => {
  const hasImage = Platform.OS === 'android' ? true : await Clipboard.hasImage();
  const image = hasImage ? await Clipboard.getImage() : null;

  if (image) {
    const base64Data = image.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    const result = await detectQRCodeInImage(base64Data);
    if (result) return result;
    presentAlert({ message: loc.send.qr_error_no_qrcode });
    return undefined;
  }

  return Clipboard.getString();
};

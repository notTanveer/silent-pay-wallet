import assert from 'assert';
import Clipboard from '@react-native-clipboard/clipboard';

import { readClipboardForPaste } from '../../helpers/clipboard';
import loc from '../../loc';

const mockClipboard = Clipboard as jest.Mocked<typeof Clipboard>;

describe('unit - readClipboardForPaste', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClipboard.hasImage.mockResolvedValue(true);
    mockClipboard.getString.mockResolvedValue('clipboard text');
  });

  it('returns clipboard text when there is no image', async () => {
    mockClipboard.getImage = jest.fn().mockResolvedValue('');
    assert.strictEqual(await readClipboardForPaste(), 'clipboard text');
  });

  it('returns the QR code decoded from a clipboard image', async () => {
    mockClipboard.getImage = jest.fn().mockResolvedValue('data:image/png;base64,qr-image');
    assert.strictEqual(await readClipboardForPaste(), 'mocked-qr-code');
    assert.strictEqual(mockClipboard.getString.mock.calls.length, 0);
  });

  it('throws the no-QR message when the image holds no QR code', async () => {
    mockClipboard.getImage = jest.fn().mockResolvedValue('data:image/png;base64,no-qr');
    const { detectQRCodeInImage } = jest.requireMock('react-native-camera-kit-no-google');
    detectQRCodeInImage.mockResolvedValueOnce(null);
    await assert.rejects(readClipboardForPaste(), { message: loc.send.qr_error_no_qrcode });
  });

  it('passes on a decoder failure', async () => {
    mockClipboard.getImage = jest.fn().mockResolvedValue('data:image/png;base64,invalid-image');
    await assert.rejects(readClipboardForPaste(), { message: 'Invalid image data' });
  });
});

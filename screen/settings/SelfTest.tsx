import BIP32Factory from 'bip32';
import bip38 from 'bip38';
import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import React, { Component } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
// @ts-ignore theres no type declaration for this
import BlueCrypto from 'react-native-blue-crypto';
import wif from 'wif';

import * as BlueElectrum from '../../blue_modules/BlueElectrum';
import * as encryption from '../../blue_modules/encryption';
import * as fs from '../../blue_modules/fs';
import ecc from '../../blue_modules/noble_ecc';
import { BlueText } from '../../BlueComponents';
import presentAlert from '../../components/Alert';
import Button from '../../components/Button';
import SaveFileButton from '../../components/SaveFileButton';
import loc from '../../loc';
import { BlueSpacing20 } from '../../components/BlueSpacing';
import { BlueLoading } from '../../components/BlueLoading.tsx';

const bip32 = BIP32Factory(ecc);

type TState = {
  isLoading?: boolean;
  isOk?: boolean;
  errorMessage?: string;
};

function assertStrictEqual<T>(actual: T, expected: T, message?: string) {
  if (expected !== actual) {
    throw new Error(message || 'Assertion failed that ' + JSON.stringify(expected) + ' equals ' + JSON.stringify(actual));
  }
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
});

export default class SelfTest extends Component {
  state: TState;

  constructor(props: any) {
    super(props);
    this.state = {
      isLoading: true,
    };
  }

  onPressImportDocument = async () => {
    try {
      fs.showFilePickerAndReadFile().then(file => {
        if (file && file.data && file.data.length > 0) {
          presentAlert({ message: file.data });
        } else {
          presentAlert({ message: 'Error reading file' });
        }
      });
    } catch (err) {
      console.log(err);
    }
  };

  async componentDidMount() {
    console.debug('SelfTest - componentDidMount');
    let errorMessage = '';
    let isOk = true;

    try {
      //

      if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
        await BlueElectrum.ping();
        await BlueElectrum.waitTillConnected();
        const addr4elect = '3GCvDBAktgQQtsbN6x5DYiQCMmgZ9Yk8BK';
        const electrumBalance = await BlueElectrum.getBalanceByAddress(addr4elect);
        if (electrumBalance.confirmed !== 51432)
          throw new Error('BlueElectrum getBalanceByAddress failure, got ' + JSON.stringify(electrumBalance));

        const electrumTxs = await BlueElectrum.getTransactionsByAddress(addr4elect);
        if (electrumTxs.length !== 1) throw new Error('BlueElectrum getTransactionsByAddress failure, got ' + JSON.stringify(electrumTxs));
      } else {
        // skipping RN-specific test'
      }

      //

      const data2encrypt = 'really long data string';
      const crypted = encryption.encrypt(data2encrypt, 'password');
      const decrypted = encryption.decrypt(crypted, 'password');

      if (decrypted !== data2encrypt) {
        throw new Error('encryption lib is not ok');
      }

      //
      const mnemonic =
        'honey risk juice trip orient galaxy win situate shoot anchor bounce remind horse traffic exotic since escape mimic ramp skin judge owner topple erode';
      const seed = bip39.mnemonicToSeedSync(mnemonic);
      const root = bip32.fromSeed(seed);

      const path = "m/49'/0'/0'/0/0";
      const child = root.derivePath(path);
      const address = bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2wpkh({
          pubkey: child.publicKey,
          network: bitcoin.networks.bitcoin,
        }),
        network: bitcoin.networks.bitcoin,
      }).address;

      if (address !== '3GcKN7q7gZuZ8eHygAhHrvPa5zZbG5Q1rK') {
        throw new Error('bip49 is not ok');
      }

      // BlueCrypto test
      if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
        const hex = await BlueCrypto.scrypt('717765727479', '4749345a22b23cf3', 64, 8, 8, 32); // using non-default parameters to speed it up (not-bip38 compliant)
        if (hex.toUpperCase() !== 'F36AB2DC12377C788D61E6770126D8A01028C8F6D8FE01871CE0489A1F696A90')
          throw new Error('react-native-blue-crypto is not ok');
      }

      // bip38 test
      if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
        let callbackWasCalled = false;
        const decryptedKey = await bip38.decryptAsync(
          '6PnU5voARjBBykwSddwCdcn6Eu9EcsK24Gs5zWxbJbPZYW7eiYQP8XgKbN',
          'qwerty',
          () => (callbackWasCalled = true),
        );
        assertStrictEqual(
          wif.encode(0x80, decryptedKey.privateKey, decryptedKey.compressed),
          'KxqRtpd9vFju297ACPKHrGkgXuberTveZPXbRDiQ3MXZycSQYtjc',
          'bip38 failed',
        );
        // bip38 with BlueCrypto doesn't support progress callback
        assertStrictEqual(callbackWasCalled, false, "bip38 doesn't use BlueCrypto");
      }

      //

      if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
        assertStrictEqual(await Linking.canOpenURL('https://github.com/BlueWallet/BlueWallet/'), true, 'Linking can not open https url');
      } else {
        // skipping RN-specific test'
      }

      //

      assertStrictEqual(Buffer.from('00ff0f', 'hex').reverse().toString('hex'), '0fff00');

      //
    } catch (Err) {
      console.log(Err);
      errorMessage += Err;
      isOk = false;
    }

    this.setState({
      isLoading: false,
      isOk,
      errorMessage,
    });
  }

  render() {
    return (
      <ScrollView automaticallyAdjustContentInsets contentInsetAdjustmentBehavior="automatic">
        <BlueSpacing20 />

        {this.state.isLoading ? (
          <BlueLoading testID="SelfTestLoading" />
        ) : (
          (() => {
            if (this.state.isOk) {
              return (
                <View style={styles.center}>
                  <BlueText testID="SelfTestOk" h4>
                    OK
                  </BlueText>
                  <BlueSpacing20 />
                  <BlueText>{loc.settings.about_selftest_ok}</BlueText>
                </View>
              );
            } else {
              return (
                <View style={styles.center}>
                  <BlueText h4 numberOfLines={0}>
                    {this.state.errorMessage}
                  </BlueText>
                </View>
              );
            }
          })()
        )}
        <BlueSpacing20 />
        <SaveFileButton fileName="bluewallet-selftest.txt" fileContent={'Success on ' + new Date().toUTCString()}>
          <Button title="Test Save to Storage" />
        </SaveFileButton>
        <BlueSpacing20 />
        <Button title="Test File Import" onPress={this.onPressImportDocument} />
      </ScrollView>
    );
  }
}

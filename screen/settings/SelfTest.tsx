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
import { HDSegwitBech32Wallet, HDSegwitP2SHWallet, LegacyWallet } from '../../class';
import presentAlert from '../../components/Alert';
import Button from '../../components/Button';
import SaveFileButton from '../../components/SaveFileButton';
import loc from '../../loc';
import { CreateTransactionUtxo } from '../../class/wallets/types.ts';
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
      if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
        const uniqs: Record<string, 1> = {};
        const w = new LegacyWallet();
        for (let c = 0; c < 1000; c++) {
          await w.generate();
          if (uniqs[w.getSecret()]) {
            throw new Error('failed to generate unique private key');
          }
          uniqs[w.getSecret()] = 1;
        }
      } else {
        // skipping RN-specific test
      }

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

      const l = new LegacyWallet();
      l.setSecret('L4ccWrPMmFDZw4kzAKFqJNxgHANjdy6b7YKNXMwB4xac4FLF3Tov');
      assertStrictEqual(l.getAddress(), '14YZ6iymQtBVQJk6gKnLCk49UScJK7SH4M');
      const utxos: CreateTransactionUtxo[] = [
        {
          txid: 'cc44e933a094296d9fe424ad7306f16916253a3d154d52e4f1a757c18242cec4',
          vout: 0,
          value: 100000,
          txhex:
            '0200000000010161890cd52770c150da4d7d190920f43b9f88e7660c565a5a5ad141abb6de09de00000000000000008002a0860100000000001976a91426e01119d265aa980390c49eece923976c218f1588ac3e17000000000000160014c1af8c9dd85e0e55a532a952282604f820746fcd02473044022072b3f28808943c6aa588dd7a4e8f29fad7357a2814e05d6c5d767eb6b307b4e6022067bc6a8df2dbee43c87b8ce9ddd9fe678e00e0f7ae6690d5cb81eca6170c47e8012102e8fba5643e15ab70ec79528833a2c51338c1114c4eebc348a235b1a3e13ab07100000000',
        },
      ];

      const txNew = l.createTransaction(
        utxos,
        [{ value: 90000, address: '1GX36PGBUrF8XahZEGQqHqnJGW2vCZteoB' }],
        1,
        String(l.getAddress()),
        0xffffffff,
        false,
        0,
      );
      const txBitcoin = bitcoin.Transaction.fromHex(txNew.tx!.toHex());
      assertStrictEqual(
        txNew.tx!.toHex(),
        '0200000001c4ce4282c157a7f1e4524d153d3a251669f10673ad24e49f6d2994a033e944cc000000006b48304502210091e58bd2021f2eeea8d39d7f7b053c9ccc52a747b60f1c3584ba33285e2d150602205b2d35a2536cbe157015e8c54a26f5fc350cc7c72b5ca80b9e548917993f652201210337c09b3cb889801638078fd4e6998218b28c92d338ea2602720a88847aedceb3ffffffff02905f0100000000001976a914aa381cd428a4e91327fd4434aa0a08ff131f1a5a88ac2e260000000000001976a91426e01119d265aa980390c49eece923976c218f1588ac00000000',
      );
      assertStrictEqual(txBitcoin.ins.length, 1);
      assertStrictEqual(txBitcoin.outs.length, 2);
      assertStrictEqual('1GX36PGBUrF8XahZEGQqHqnJGW2vCZteoB', bitcoin.address.fromOutputScript(txBitcoin.outs[0].script)); // to address
      assertStrictEqual(l.getAddress(), bitcoin.address.fromOutputScript(txBitcoin.outs[1].script)); // change address

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

      //
      if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
        const hd = new HDSegwitP2SHWallet();
        const hashmap: Record<string, 1> = {};
        for (let c = 0; c < 1000; c++) {
          await hd.generate();
          const secret = hd.getSecret();
          if (hashmap[secret]) {
            throw new Error('Duplicate secret generated!');
          }
          hashmap[secret] = 1;
          if (secret.split(' ').length !== 12 && secret.split(' ').length !== 24) {
            throw new Error('mnemonic phrase not ok');
          }
        }

        const hd2 = new HDSegwitP2SHWallet();
        hd2.setSecret(hd.getSecret());
        if (!hd2.validateMnemonic()) {
          throw new Error('mnemonic phrase validation not ok');
        }

        //

        const hd4 = new HDSegwitBech32Wallet();
        hd4._xpub = 'zpub6rnbAtzupLPpSrsBKRsHupFvv1h6pwfRnZxX3qs6RL4LiLqKQ6kfBaDckn2apQWfyw1D2TdQMMDCfUDHMwtrcbGoy88xoKBLmADTFK9AhLe';
        await hd4.fetchBalance();
        if (hd4.getBalance() !== 2400) throw new Error('Could not fetch HD Bech32 balance');
        await hd4.fetchTransactions();
        if (hd4.getTransactions().length !== 4) throw new Error('Could not fetch HD Bech32 transactions');
      } else {
        // skipping RN-specific test
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

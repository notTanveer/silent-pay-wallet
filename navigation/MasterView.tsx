import React from 'react';
import DevMenu from '../components/DevMenu';
import MainRoot from './index';
import { useWalletShortcuts } from '../hooks/useWalletShortcuts';

const MasterView = () => {
  useWalletShortcuts();

  return (
    <>
      <MainRoot />
      {__DEV__ && <DevMenu />}
    </>
  );
};

export default MasterView;

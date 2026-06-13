import React, { lazy, Suspense } from 'react';

import { LazyLoadingIndicator } from './LazyLoadingIndicator';

// Define lazy imports with more reliable loading patterns
const WalletsAdd = lazy(() => import('../screen/wallets/Add'));
const ImportSpeed = lazy(() => import('../screen/wallets/ImportSpeed'));
const ImportWallet = lazy(() => import('../screen/wallets/ImportWallet'));
const PleaseBackup = lazy(() => import('../screen/wallets/PleaseBackup'));

export const AddComponent: React.FC = () => (
  <Suspense fallback={<LazyLoadingIndicator />}>
    <WalletsAdd />
  </Suspense>
);

export const ImportWalletComponent = () => (
  <Suspense fallback={<LazyLoadingIndicator />}>
    <ImportWallet />
  </Suspense>
);

export const ImportSpeedComponent = () => (
  <Suspense fallback={<LazyLoadingIndicator />}>
    <ImportSpeed />
  </Suspense>
);

export const PleaseBackupComponent = () => (
  <Suspense fallback={<LazyLoadingIndicator />}>
    <PleaseBackup />
  </Suspense>
);

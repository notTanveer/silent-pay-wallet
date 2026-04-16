import React, { lazy, Suspense } from 'react';

import { LazyLoadingIndicator } from './LazyLoadingIndicator';

const AztecoRedeem = lazy(() => import('../screen/receive/AztecoRedeem'));

export const AztecoRedeemComponent = () => (
  <Suspense fallback={<LazyLoadingIndicator />}>
    <AztecoRedeem />
  </Suspense>
);

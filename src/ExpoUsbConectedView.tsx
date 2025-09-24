import { requireNativeView } from 'expo';
import * as React from 'react';

import { ExpoUsbConectedViewProps } from './ExpoUsbConected.types';

const NativeView: React.ComponentType<ExpoUsbConectedViewProps> =
  requireNativeView('ExpoUsbConected');

export default function ExpoUsbConectedView(props: ExpoUsbConectedViewProps) {
  return <NativeView {...props} />;
}

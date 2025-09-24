import * as React from 'react';

import { ExpoUsbConectedViewProps } from './ExpoUsbConected.types';

export default function ExpoUsbConectedView(props: ExpoUsbConectedViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}

import React from 'react';
import { HostingConnectionsSettings } from './HostingConnectionsSettings';

export function GitLabConnectionsSettings(props: { servers: string[]; loading: boolean; onChanged: () => Promise<void> }) {
  return <HostingConnectionsSettings provider="gitlab" {...props} />;
}

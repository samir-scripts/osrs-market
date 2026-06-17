'use client';

import React from 'react';
import { ApolloProvider } from '@apollo/client/react';
import { client } from '../lib/apollo-client';
import ReadinessGate from '../components/ReadinessGate';
import DashboardContent from '../components/DashboardContent';

export default function Home() {
  return (
    <ApolloProvider client={client}>
      <ReadinessGate>
        <DashboardContent />
      </ReadinessGate>
    </ApolloProvider>
  );
}

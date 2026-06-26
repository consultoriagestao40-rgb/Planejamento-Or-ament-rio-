'use client';

import React from 'react';
import dynamic from 'next/dynamic';

interface DashboardWrapperProps {
    isConnected: boolean;
    isTestMode: boolean;
    authUrl: string;
    params: { connected?: string; error?: string };
    serverUserRole?: string;
}

const Loading = () => (
  <main className="dashboard-loading-screen">
    <style>{`
      .dashboard-loading-screen {
        width: 100%;
        min-height: 100vh;
        background-color: var(--bg-base);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary);
      }
      .dashboard-loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
      }
      .dashboard-loading-text {
        font-size: 0.90rem;
        font-weight: 700;
      }
    `}</style>
    <div className="dashboard-loading-container">
      <div className="spinner" />
      <span className="dashboard-loading-text">Carregando Painel...</span>
    </div>
  </main>
);

const FinancialDashboard = dynamic(
  () => import('@/components/FinancialDashboard'),
  { 
    ssr: false,
    loading: Loading
  }
);

export default function DashboardWrapper(props: DashboardWrapperProps) {
    return <FinancialDashboard {...props} />;
}

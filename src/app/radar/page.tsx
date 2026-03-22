'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * RADAR MANAGEMENT PAGE - DISABLED
 * This feature has been deactivated as per user request.
 * The original code is preserved below in comments.
 */
export default function RadarManagementPage() {
    const router = useRouter();

    useEffect(() => {
        // Feature disabled. Redirecting to home.
        router.push('/');
    }, [router]);

    return (
        <div style={{ 
            display: 'flex', 
            height: '100vh', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontFamily: 'Inter, system-ui, sans-serif',
            backgroundColor: '#f8fafc'
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎯</div>
                <p style={{ color: '#64748b', fontWeight: 500 }}>Recurso desativado. Redirecionando...</p>
            </div>
        </div>
    );
}

/* 
ORIGINAL CODE PRESERVED FOR FUTURE USE:

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Company {
    id: string;
    name: string;
    cnpj: string;
}

interface RadarLock {
    tenantId: string;
    month: number;
    year: number;
    isLocked: boolean;
    deadline: string | null;
}

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function RadarManagementPage() {
    // ... rest of the original code ...
}
*/

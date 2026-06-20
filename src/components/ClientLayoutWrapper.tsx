'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLoginPage = pathname === '/login';

    if (isLoginPage) {
        return <>{children}</>;
    }

    const menuItems = [
        { 
            label: 'Dashboard', 
            path: '/', 
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="9" />
                    <rect x="14" y="3" width="7" height="5" />
                    <rect x="14" y="12" width="7" height="9" />
                    <rect x="3" y="16" width="7" height="5" />
                </svg>
            )
        },
        { 
            label: 'Orçamento', 
            path: '/summary', 
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
            )
        },
        { 
            label: 'Sincronizar', 
            path: '/sync', 
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
            )
        },
        { 
            label: 'Empresa', 
            path: '/api/auth/url', 
            external: true,
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                    <line x1="9" y1="22" x2="9" y2="16" />
                    <line x1="15" y1="22" x2="15" y2="16" />
                    <line x1="9" y1="16" x2="15" y2="16" />
                    <path d="M9 8h6" />
                    <path d="M9 12h6" />
                </svg>
            )
        },
        { 
            label: 'Usuários', 
            path: '/users', 
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
            )
        },
        { 
            label: 'Análise', 
            path: '/carteira', 
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                    <path d="M22 12A10 10 0 0 0 12 2v10z" />
                </svg>
            )
        }
    ];

    const handleLogout = async () => {
        if (confirm('Deseja realmente sair?')) {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login';
        }
    };

    return (
        <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', overflowX: 'hidden' }}>
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <span style={{ color: '#1d4ed8', fontWeight: 800 }}>Budget</span>
                    <span style={{ color: '#0f172a', fontWeight: 800 }}>Hub</span>
                </div>
                <nav style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <ul className="sidebar-menu">
                        {menuItems.map((item, idx) => {
                            const isSelected = item.path === '/' 
                                ? pathname === '/' 
                                : pathname.startsWith(item.path);

                            if (item.external) {
                                return (
                                    <li key={idx}>
                                        <a 
                                            href={item.path} 
                                            className="sidebar-item"
                                        >
                                            <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                                            <span>{item.label}</span>
                                        </a>
                                    </li>
                                );
                            }

                            return (
                                <li key={idx}>
                                    <Link 
                                        href={item.path} 
                                        className={`sidebar-item ${isSelected ? 'active' : ''}`}
                                    >
                                        <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                                        <span>{item.label}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
                <div className="sidebar-footer">
                    <button 
                        onClick={handleLogout}
                        className="sidebar-item" 
                        style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </span>
                        <span>Sair</span>
                    </button>
                    <div style={{ fontSize: '0.75rem', opacity: 0.5, textAlign: 'center', marginTop: '1rem', color: '#64748b' }}>
                        BudgetHub © {new Date().getFullYear()}
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}

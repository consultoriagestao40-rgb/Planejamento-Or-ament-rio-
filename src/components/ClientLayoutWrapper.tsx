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
        { label: 'Dashboard', path: '/', icon: '📊' },
        { label: 'Orçamento', path: '/summary', icon: '💰' },
        { label: 'Sincronizar', path: '/sync', icon: '🔄' },
        { label: 'Empresa', path: '/api/auth/url', icon: '🏢', external: true },
        { label: 'Usuários', path: '/users', icon: '👥' },
        { label: 'Análise', path: '/carteira', icon: '💼' }
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
                    <span>Budget Hub</span>
                </div>
                <nav style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <ul className="sidebar-menu">
                        {menuItems.map((item, idx) => {
                            // O Dashboard é o path '/' e deve ser exatamente igual, os outros dão match por prefixo
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
                                            <span style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center' }}>{item.icon}</span>
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
                                        <span style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center' }}>{item.icon}</span>
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
                        style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem' }}
                    >
                        <span style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center' }}>🚪</span>
                        <span>Sair</span>
                    </button>
                    <div style={{ fontSize: '0.75rem', opacity: 0.5, textAlign: 'center', marginTop: '1rem', color: 'rgba(255,255,255,0.6)' }}>
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

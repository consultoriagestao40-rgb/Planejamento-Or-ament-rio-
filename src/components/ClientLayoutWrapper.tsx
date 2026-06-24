'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLoginPage = pathname === '/login';
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('sidebar-collapsed');
        if (stored !== null) {
            setIsCollapsed(stored === 'true');
        }
    }, []);

    const toggleCollapse = () => {
        setIsCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('sidebar-collapsed', String(next));
            return next;
        });
    };

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
            label: 'Fluxo de Caixa (DFC)', 
            path: '/dfc', 
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    <polyline points="3 17 9 11 13 15 21 7" />
                    <polyline points="14 7 21 7 21 14" />
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
        },
        { 
            label: 'CFO Virtual', 
            path: '/cfo-virtual', 
            icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a10 10 0 0 1 7.54 16.59L19.5 22l-3.41-1.41A10 10 0 1 1 12 2z" />
                    <circle cx="12" cy="12" r="3.5" fill="currentColor" fillOpacity="0.4" />
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
            <aside 
                className="sidebar"
                style={{ 
                    width: isCollapsed ? '72px' : '260px',
                    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    height: '100vh',
                    zIndex: 100
                }}
            >
                {/* Floating Collapse/Expand Button */}
                <button
                    onClick={toggleCollapse}
                    style={{
                        position: 'absolute',
                        top: '24px',
                        right: '-12px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 110,
                        color: '#475569',
                        padding: 0
                    }}
                    title={isCollapsed ? "Expandir menu" : "Recolher menu"}
                >
                    <svg 
                        width="14" 
                        height="14" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        style={{
                            transform: isCollapsed ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.3s'
                        }}
                    >
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>

                <div 
                    className="sidebar-logo"
                    style={{
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                        padding: isCollapsed ? '1.2rem 0' : '1.2rem 1.2rem',
                        transition: 'padding 0.3s'
                    }}
                >
                    {isCollapsed ? (
                        <div style={{ display: 'flex', gap: '1px' }}>
                            <span style={{ color: '#ffffff', fontWeight: 900, fontSize: '1.4rem' }}>B</span>
                            <span style={{ color: '#93c5fd', fontWeight: 900, fontSize: '1.4rem' }}>H</span>
                        </div>
                    ) : (
                        <>
                            <span style={{ color: '#ffffff', fontWeight: 800 }}>Budget</span>
                            <span style={{ color: '#93c5fd', fontWeight: 800 }}>Hub</span>
                        </>
                    )}
                </div>
                <nav style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <ul className="sidebar-menu" style={{ padding: isCollapsed ? '0.8rem 0.4rem' : '0.8rem 0.8rem', transition: 'padding 0.3s' }}>
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
                                            style={{
                                                justifyContent: isCollapsed ? 'center' : 'flex-start',
                                                padding: isCollapsed ? '0.45rem 0' : '0.45rem 1rem',
                                                gap: isCollapsed ? '0' : '0.85rem',
                                                transition: 'padding 0.3s, gap 0.3s'
                                            }}
                                        >
                                            <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                                            <span style={{ 
                                                opacity: isCollapsed ? 0 : 1, 
                                                width: isCollapsed ? 0 : 'auto',
                                                visibility: isCollapsed ? 'hidden' : 'visible',
                                                transition: 'opacity 0.2s, width 0.2s, visibility 0.2s',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {item.label}
                                            </span>
                                        </a>
                                    </li>
                                );
                            }

                            return (
                                <li key={idx}>
                                    <Link 
                                        href={item.path} 
                                        className={`sidebar-item ${isSelected ? 'active' : ''}`}
                                        style={{
                                            justifyContent: isCollapsed ? 'center' : 'flex-start',
                                            padding: isCollapsed ? '0.45rem 0' : '0.45rem 1rem',
                                            gap: isCollapsed ? '0' : '0.85rem',
                                            transition: 'padding 0.3s, gap 0.3s'
                                        }}
                                    >
                                        <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                                        <span style={{ 
                                            opacity: isCollapsed ? 0 : 1, 
                                            width: isCollapsed ? 0 : 'auto',
                                            visibility: isCollapsed ? 'hidden' : 'visible',
                                            transition: 'opacity 0.2s, width 0.2s, visibility 0.2s',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {item.label}
                                        </span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
                <div className="sidebar-footer" style={{ padding: isCollapsed ? '0.8rem 0.4rem' : '0.8rem 1rem', transition: 'padding 0.3s' }}>
                    <button 
                        onClick={handleLogout}
                        className="sidebar-item" 
                        style={{ 
                            background: 'none', 
                            border: 'none', 
                            width: '100%', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: isCollapsed ? 'center' : 'flex-start',
                            padding: isCollapsed ? '0.45rem 0' : '0.45rem 1rem',
                            gap: isCollapsed ? '0' : '0.75rem',
                            transition: 'padding 0.3s, gap 0.3s'
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </span>
                        <span style={{ 
                            opacity: isCollapsed ? 0 : 1, 
                            width: isCollapsed ? 0 : 'auto',
                            visibility: isCollapsed ? 'hidden' : 'visible',
                            transition: 'opacity 0.2s, width 0.2s, visibility 0.2s',
                            whiteSpace: 'nowrap'
                        }}>
                            Sair
                        </span>
                    </button>
                    {!isCollapsed && (
                        <div style={{ fontSize: '0.75rem', opacity: 0.5, textAlign: 'center', marginTop: '1rem', color: '#64748b' }}>
                            BudgetHub © {new Date().getFullYear()}
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <main 
                className="main-content"
                style={{ 
                    marginLeft: isCollapsed ? '72px' : '260px',
                    width: isCollapsed ? 'calc(100vw - 72px)' : 'calc(100vw - 260px)',
                    transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxSizing: 'border-box'
                }}
            >
                {children}
            </main>
        </div>
    );
}

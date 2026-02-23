'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UsersPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [companies, setCompanies] = useState<any[]>([]);
    const [costCenters, setCostCenters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const router = useRouter();

    const [form, setForm] = useState({
        name: '', email: '', password: '', role: 'GESTOR',
        tenantIds: [] as string[], costCenterIds: [] as string[]
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [uRes, cRes, sRes] = await Promise.all([
                fetch('/api/users'),
                fetch('/api/companies'),
                fetch('/api/setup')
            ]);

            if (uRes.status === 401 || uRes.status === 403) {
                router.push('/');
                return;
            }

            const uData = await uRes.json();
            const cData = await cRes.json();
            const sData = await sRes.json();

            if (uData.success) setUsers(uData.users);
            if (cData.success) setCompanies(cData.companies);
            if (sData.success) setCostCenters(sData.costCenters);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (user: any = null) => {
        setEditingUser(user);
        if (user) {
            setForm({
                name: user.name, email: user.email, password: '', role: user.role,
                tenantIds: user.tenantIds || [], costCenterIds: user.costCenterIds || []
            });
        } else {
            setForm({ name: '', email: '', password: '', role: 'GESTOR', tenantIds: [], costCenterIds: [] });
        }
        setModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
            const method = editingUser ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            const data = await res.json();

            if (data.success) {
                setModalOpen(false);
                fetchData();
            } else {
                alert(data.error);
            }
        } catch (e) {
            alert('Erro ao salvar');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir este usuário?')) return;
        const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) fetchData();
        else alert(data.error);
    };

    const toggleArrayItem = (array: string[], item: string, setArray: (val: string[]) => void) => {
        if (array.includes(item)) setArray(array.filter(i => i !== item));
        else setArray([...array, item]);
    };

    if (loading) return <div style={{ padding: '2rem' }}>Carregando...</div>;

    return (
        <main style={{ padding: '2rem 4rem', boxSizing: 'border-box', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <a href="/" style={{ fontSize: '1.5rem', textDecoration: 'none', color: '#64748b' }}>←</a>
                    <h1 style={{ color: '#0f172a', margin: 0 }}>Gestão de Usuários</h1>
                </div>
                <button onClick={() => handleOpenModal()} style={{ padding: '0.6rem 1.2rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>+ Novo Usuário</button>
            </header>

            <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                        <tr>
                            <th style={{ padding: '1rem', color: '#475569', fontSize: '0.875rem' }}>Nome</th>
                            <th style={{ padding: '1rem', color: '#475569', fontSize: '0.875rem' }}>E-mail</th>
                            <th style={{ padding: '1rem', color: '#475569', fontSize: '0.875rem' }}>Perfil</th>
                            <th style={{ padding: '1rem', color: '#475569', fontSize: '0.875rem' }}>Acessos (CCs)</th>
                            <th style={{ padding: '1rem', color: '#475569', fontSize: '0.875rem', textAlign: 'right' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '1rem', color: '#334155' }}>{u.name}</td>
                                <td style={{ padding: '1rem', color: '#64748b' }}>{u.email}</td>
                                <td style={{ padding: '1rem' }}>
                                    <span style={{ padding: '0.2rem 0.6rem', backgroundColor: u.role === 'MASTER' ? '#dbeafe' : '#f1f5f9', color: u.role === 'MASTER' ? '#1d4ed8' : '#475569', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>{u.role}</span>
                                </td>
                                <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
                                    {u.role === 'MASTER' ? 'Todos' : `${u.costCenterIds.length} centro(s)`}
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'right' }}>
                                    <button onClick={() => handleOpenModal(u)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', marginRight: '1rem' }}>✏️ Editar</button>
                                    <button onClick={() => handleDelete(u.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>🗑️ Excluir</button>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Nenhum usuário encontrado</td></tr>}
                    </tbody>
                </table>
            </div>

            {modalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ margin: '0 0 1.5rem 0', color: '#0f172a' }}>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h2>
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '0.875rem', color: '#334155', marginBottom: '0.25rem', fontWeight: 600 }}>Nome</label>
                                    <input required type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '0.875rem', color: '#334155', marginBottom: '0.25rem', fontWeight: 600 }}>Perfil</label>
                                    <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                        <option value="GESTOR">GESTOR (Acesso Restrito)</option>
                                        <option value="MASTER">MASTER (Acesso Total)</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '0.875rem', color: '#334155', marginBottom: '0.25rem', fontWeight: 600 }}>E-mail</label>
                                    <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '0.875rem', color: '#334155', marginBottom: '0.25rem', fontWeight: 600 }}>Senha {editingUser && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>(Deixe em branco para não alterar)</span>}</label>
                                    <input type="password" required={!editingUser} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                                </div>
                            </div>

                            {form.role === 'GESTOR' && (
                                <>
                                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.875rem', color: '#334155', marginBottom: '0.5rem', fontWeight: 600 }}>Acesso a Empresas (Tenants)</label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {companies.map(c => (
                                                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', backgroundColor: '#f8fafc', padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                                    <input type="checkbox" checked={form.tenantIds.includes(c.id)} onChange={() => toggleArrayItem(form.tenantIds, c.id, (val) => setForm({ ...form, tenantIds: val }))} />
                                                    {c.name}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.875rem', color: '#334155', marginBottom: '0.5rem', fontWeight: 600 }}>Acesso a Centros de Custo</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                                            {costCenters.map(cc => (
                                                <label key={cc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                                                    <input type="checkbox" checked={form.costCenterIds.includes(cc.id)} onChange={() => toggleArrayItem(form.costCenterIds, cc.id, (val) => setForm({ ...form, costCenterIds: val }))} />
                                                    {cc.name}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setModalOpen(false)} style={{ padding: '0.6rem 1.2rem', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" style={{ padding: '0.6rem 1.2rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Salvar Usuário</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}

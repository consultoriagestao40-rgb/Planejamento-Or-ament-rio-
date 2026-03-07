import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

async function ensureSchema() {
    try {
        await prisma.$executeRawUnsafe(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='UserCostCenterAccess' AND column_name='accessLevel') THEN
                    ALTER TABLE "UserCostCenterAccess" ADD COLUMN "accessLevel" TEXT NOT NULL DEFAULT 'EDITAR';
                END IF;
            END $$;
        `);
    } catch (e) {
        console.error("Error migrating UserCostCenterAccess:", e);
    }
}

async function getMasterUser() {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) return null;

    const payload = await verifyToken(token);
    if (!payload || payload.role !== 'MASTER') return null;

    return payload;
}

export async function GET(request: Request) {
    try {
        await ensureSchema();
        const master = await getMasterUser();
        if (!master) {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        const users = await prisma.user.findMany({
            include: {
                tenantAccess: {
                    include: { tenant: true }
                },
                costCenterAccess: {
                    include: { costCenter: true }
                }
            },
            orderBy: { name: 'asc' }
        });

        // Map to format suitable for frontend
        const mappedUsers = users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            tenantIds: u.tenantAccess.map(t => t.tenantId),
            costCenterAccess: u.costCenterAccess.map(c => ({
                costCenterId: c.costCenterId,
                accessLevel: c.accessLevel
            }))
        }));

        return NextResponse.json({ success: true, users: mappedUsers });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const master = await getMasterUser();
        if (!master) {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        const body = await request.json();
        const { name, email, password, role, tenantIds, costCenterAccess } = body;

        if (!name || !email || !password) {
            return NextResponse.json({ success: false, error: 'Nome, email e senha são obrigatórios' }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ success: false, error: 'Email já está em uso' }, { status: 400 });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                passwordHash,
                role: role || 'GESTOR',
                tenantAccess: {
                    create: (tenantIds || []).map((id: string) => ({ tenantId: id }))
                },
                costCenterAccess: {
                    create: (costCenterAccess || []).map((cc: any) => ({
                        costCenterId: cc.costCenterId,
                        accessLevel: cc.accessLevel || 'EDITAR'
                    }))
                }
            }
        });

        return NextResponse.json({ success: true, user: { id: newUser.id, name: newUser.name } });
    } catch (error) {
        console.error('Error creating user:', error);
        return NextResponse.json({ success: false, error: 'Erro interno no servidor' }, { status: 500 });
    }
}

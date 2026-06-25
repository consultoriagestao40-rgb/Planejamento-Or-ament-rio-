import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');

        if (!tenantId) {
            return NextResponse.json({ success: false, error: 'Parâmetro tenantId é obrigatório' }, { status: 400 });
        }

        // Buscar usuários com acesso ao tenant correspondente
        const usersAccess = await prisma.userTenantAccess.findMany({
            where: { tenantId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatarUrl: true
                    }
                }
            }
        });

        // Extrair o objeto User
        const usersList = usersAccess.map(ua => ua.user).filter(Boolean);

        // Fallback: se não houver usuários mapeados para este tenant, retornar todos os usuários
        if (usersList.length === 0) {
            const allUsers = await prisma.user.findMany({
                select: {
                    id: true,
                    name: true,
                    email: true,
                    avatarUrl: true
                }
            });
            return NextResponse.json({ success: true, data: allUsers });
        }

        return NextResponse.json({ success: true, data: usersList });
    } catch (e: any) {
        console.error('[API USERS LIST GET] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

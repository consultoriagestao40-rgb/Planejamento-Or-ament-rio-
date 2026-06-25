import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// GET: Lista todas as sessões de chat do usuário autenticado
export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const sessionUser = token ? await verifyToken(token) : null;

        if (!sessionUser || !sessionUser.userId) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const sessions = await prisma.chatSession.findMany({
            where: {
                userId: sessionUser.userId as string,
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        return NextResponse.json({ success: true, sessions });
    } catch (error: any) {
        console.error('Error fetching chat sessions:', error);
        return NextResponse.json({ success: false, error: 'Erro ao buscar sessões de chat' }, { status: 500 });
    }
}

// POST: Cria uma nova sessão de chat
export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const sessionUser = token ? await verifyToken(token) : null;

        if (!sessionUser || !sessionUser.userId) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { title, tenantId } = body;

        if (!title || !tenantId) {
            return NextResponse.json({ success: false, error: 'Título e tenantId são obrigatórios' }, { status: 400 });
        }

        const newSession = await prisma.chatSession.create({
            data: {
                title,
                tenantId,
                userId: sessionUser.userId as string,
            },
        });

        return NextResponse.json({ success: true, session: newSession });
    } catch (error: any) {
        console.error('Error creating chat session:', error);
        return NextResponse.json({ success: false, error: 'Erro ao criar sessão de chat' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// GET: Recupera os detalhes de uma sessão de chat e suas mensagens
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const sessionUser = token ? await verifyToken(token) : null;

        if (!sessionUser || !sessionUser.userId) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const { id } = await params;

        const session = await prisma.chatSession.findUnique({
            where: { id },
            include: {
                messages: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
            },
        });

        if (!session) {
            return NextResponse.json({ success: false, error: 'Sessão de chat não encontrada' }, { status: 404 });
        }

        if (session.userId !== sessionUser.userId) {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        return NextResponse.json({ success: true, session });
    } catch (error: any) {
        console.error('Error fetching chat session details:', error);
        return NextResponse.json({ success: false, error: 'Erro ao buscar detalhes da sessão de chat' }, { status: 500 });
    }
}

// PATCH: Atualiza o título de uma sessão de chat
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const sessionUser = token ? await verifyToken(token) : null;

        if (!sessionUser || !sessionUser.userId) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { title } = body;

        if (!title) {
            return NextResponse.json({ success: false, error: 'Título é obrigatório' }, { status: 400 });
        }

        const session = await prisma.chatSession.findUnique({
            where: { id },
        });

        if (!session) {
            return NextResponse.json({ success: false, error: 'Sessão de chat não encontrada' }, { status: 404 });
        }

        if (session.userId !== sessionUser.userId) {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        const updatedSession = await prisma.chatSession.update({
            where: { id },
            data: { title },
        });

        return NextResponse.json({ success: true, session: updatedSession });
    } catch (error: any) {
        console.error('Error updating chat session title:', error);
        return NextResponse.json({ success: false, error: 'Erro ao atualizar título da sessão de chat' }, { status: 500 });
    }
}

// DELETE: Exclui uma sessão de chat e suas mensagens em cascata
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const sessionUser = token ? await verifyToken(token) : null;

        if (!sessionUser || !sessionUser.userId) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const { id } = await params;

        const session = await prisma.chatSession.findUnique({
            where: { id },
        });

        if (!session) {
            return NextResponse.json({ success: false, error: 'Sessão de chat não encontrada' }, { status: 404 });
        }

        if (session.userId !== sessionUser.userId) {
            return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
        }

        await prisma.chatSession.delete({
            where: { id },
        });

        return NextResponse.json({ success: true, message: 'Sessão de chat excluída com sucesso' });
    } catch (error: any) {
        console.error('Error deleting chat session:', error);
        return NextResponse.json({ success: false, error: 'Erro ao excluir sessão de chat' }, { status: 500 });
    }
}

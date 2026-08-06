import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/auth';

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Public paths
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/api/cron/sync') ||
        pathname.startsWith('/api/companies') ||
        pathname.startsWith('/api/sync-all-diagnostic') ||
        pathname.startsWith('/api/debug-dump-spot') ||
        pathname.startsWith('/api/debug-ca-raw') ||
        pathname.startsWith('/api/debug-final-jan-2026') ||
        pathname.startsWith('/api/debug-deep-audit') ||
        pathname.startsWith('/api/debug-tenants') ||
        pathname.startsWith('/api/debug-sync') ||
        pathname.startsWith('/api/debug-db') ||
        pathname.startsWith('/api/diag-db') ||
        pathname.startsWith('/api/debug-check-jan') ||
        pathname.startsWith('/api/cost-centers/summary') ||
        pathname.startsWith('/api/debug-summary-data') ||
        pathname.startsWith('/api/debug-env') ||
        pathname.startsWith('/api/maintenance') ||
        pathname.startsWith('/api/diag-taxes') ||
        pathname.startsWith('/api/diag-id') ||
        pathname.startsWith('/api/debug-cc-271') ||
        pathname.startsWith('/api/diag-ca') ||
        pathname.startsWith('/api/version') ||
        pathname.startsWith('/api/run-push') ||
        pathname.startsWith('/api/clean-ghosts') ||
        pathname.startsWith('/api/diag-db-query') ||
        pathname.startsWith('/api/kpi/detailed-chart-data') ||
        pathname.startsWith('/api/debug-diarias') ||
        pathname === '/login' ||
        pathname === '/favicon.ico'
    ) {
        return NextResponse.next();
    }

    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
    }

    const user: any = await verifyToken(token);
    if (!user) {
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
    }

    if (user.role === 'EXTERNO') {
        // Block modifying API requests (POST/PUT/DELETE/PATCH)
        if (pathname.startsWith('/api/') && request.method !== 'GET') {
            return NextResponse.json(
                { success: false, error: 'Acesso negado: Visualizadores não têm permissão de alteração.' },
                { status: 403 }
            );
        }

        // Only allow Home (DRE), summary/orcamento (Budgets), forecast (Forecast), and GET APIs
        const isPageAllowed =
            pathname === '/' ||
            pathname.startsWith('/orcamento') ||
            pathname.startsWith('/summary') ||
            pathname.startsWith('/forecast');

        const isApiAllowed = pathname.startsWith('/api/');

        if (!isPageAllowed && !isApiAllowed) {
            const homeUrl = new URL('/', request.url);
            return NextResponse.redirect(homeUrl);
        }
    }

    return NextResponse.next();
}

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
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
        pathname.startsWith('/api/debug-cc') ||
        pathname.startsWith('/api/debug-cc/repair-orphans') ||
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

    return NextResponse.next();
}

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
        pathname.startsWith('/api/debug-final-jan-2026') ||
        pathname.startsWith('/api/debug-deep-audit') ||
        pathname.startsWith('/api/debug-tenants') ||
        pathname.startsWith('/api/debug-db-dump') ||
        pathname.startsWith('/api/diag-cats') ||
        pathname.startsWith('/api/version') ||
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

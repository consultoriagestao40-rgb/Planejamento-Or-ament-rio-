import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Public paths
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/api/diag-summary') ||
        pathname.startsWith('/api/debug-sync') ||
        pathname.startsWith('/api/debug3') ||
        pathname.startsWith('/api/debug6') ||
        pathname.startsWith('/api/debug8') ||
        pathname.startsWith('/api/cron/sync') ||
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

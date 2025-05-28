// middleware.ts

import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';

export function middleware(request: NextRequest) {
    // Check to see if this is an instantiation of a Discord activity
    const searchParams = request.nextUrl.searchParams;
    // https://localhost:8051/?
    if (
        searchParams.has('instance_id') &&
        request.nextUrl.pathname === "/"
    ) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/discord/activities/quotes_game"
        return NextResponse.redirect(redirectUrl);
    }

    const response = NextResponse.next();

    console.log("MIDDLEWARE", request.nextUrl.pathname);
    if (request.nextUrl.pathname.startsWith('/discord')) {
        response.headers.set(
            'Content-Security-Policy',
            'frame-ancestors https://discord.com'
        );
    }

    return response;
}


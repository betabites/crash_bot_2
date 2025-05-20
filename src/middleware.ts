// middleware.ts

// import { NextResponse } from 'next/server';
// import type { NextRequest } from 'next/server';
//
// export function middleware(request: NextRequest) {
//     const response = NextResponse.next();
//
//     console.log("MIDDLEWARE", request.nextUrl.pathname);
//     if (request.nextUrl.pathname.startsWith('/discord')) {
//         response.headers.set(
//             'Content-Security-Policy',
//             'frame-ancestors https://discord.com'
//         );
//     }
//
//     return response;
// }

export function middleware(...args: any[]) {return args}

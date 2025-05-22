"use client"
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";

const queryClient = new QueryClient()

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
        <head>
            <link rel="stylesheet" href="/styles.css"/>
        </head>
        <body>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </body>
        </html>
    )
}
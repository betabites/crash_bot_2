import {DiscordActivityProvider} from "@/web/components/discordActivityContext.tsx";

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode
}) {
    return <DiscordActivityProvider>
        {children}
    </DiscordActivityProvider>
}
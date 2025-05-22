import {DiscordActivityProvider} from "../../web/components/discordActivityContext";
import {AudioContextProvider} from "../../web/components/audioContext";

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode
}) {
    return <AudioContextProvider>
        <DiscordActivityProvider>
            {children}
        </DiscordActivityProvider>
    </AudioContextProvider>
}
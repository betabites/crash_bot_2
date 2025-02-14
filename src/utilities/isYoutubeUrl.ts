export function isYoutubeUrl(url: string) {
    return url.startsWith("https://m.youtube.com") || url.startsWith("https://youtube.com") || url.startsWith("https://youtu.be") || url.startsWith("https://www.youtube.com") || url.startsWith("https://www.youtu.be")
}

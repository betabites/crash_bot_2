import spotifydl from "spotifydl-core";

console.log()

const Spotify = new spotifydl.default({
    clientId: process.env["SPOTIFY_CLIENT_ID"] ?? '',
    clientSecret: process.env["SPOTIFY_CLIENT_SECRET"] ?? ''
})

export default Spotify

import http from "node:http";
import {Server} from "socket.io";
import next from 'next'
import {parse} from "node:url";
import dotenv from "dotenv";

const dev = process.env.NODE_ENV !== 'production'
// @ts-ignore
const app = next({ dev })
const handle = app.getRequestHandler()

dotenv.config()
const port = parseInt(process.env.PORT || '3000', 10)

export const HTTP_SERVER = (async () => {
    await app.prepare()
    console.log("App prepared")

    return http.createServer((req, res) => {
        const parsedUrl = parse(req.url!, true)
        handle(req, res, parsedUrl)
    }).listen(port)
})()

export const IO = (async () => {
    let io = new Server(await HTTP_SERVER, {
        pingInterval: 120000
    })
    io.on("connection", (socket) => {
        console.log("Received a socket connection")
    })
    return io
})()

export async function configureNext() {
    await HTTP_SERVER
}

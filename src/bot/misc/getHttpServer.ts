import http from "node:http";
import {Server} from "socket.io";
import next from 'next'
import {parse} from "node:url";

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const port = parseInt(process.env.PORT || '3000', 10)

export const HTTP_SERVER = http.createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
}).listen(port)

export const IO = new Server(HTTP_SERVER, {
    pingInterval: 120000
})

IO.on("connection", (socket) => {
    console.log("Received a socket connection")
})

export async function configureNext() {
    await app.prepare()

}

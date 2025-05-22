import http from "node:http";
import https from "node:https";
import {Server} from "socket.io";
import next from 'next'
import {parse} from "node:url";
import dotenv from "dotenv";
import path from "node:path"
import fs from "node:fs"

const dev = process.env.NODE_ENV !== 'production'
// @ts-ignore
const app = next({ dev })
const handle = app.getRequestHandler()

dotenv.config()
const port = parseInt(process.env.PORT || '3000', 10)

export const HTTP_SERVER = http.createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
}).listen(port)
export const HTTPS_SERVER = https.createServer({
    key: fs.readFileSync(path.resolve("./assets/ssl/privkey.pem")),
    cert: fs.readFileSync(path.resolve("./assets/ssl/fullchain.pem"))
}, (req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
}).listen(8051)

export const IO = new Server(HTTP_SERVER, {
    pingInterval: 120000
})

IO.on("connection", (socket) => {
    console.log("Received a socket connection")
})

export async function configureNext() {
    console.log("App prepared")
    await app.prepare()

}

import express from "express";
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import {Server} from "socket.io";

export const EXPRESS_APP = express()
export const HTTP_SERVER = http.createServer(EXPRESS_APP).listen(8051)
export const HTTPS_SERVER = https.createServer({
    key: fs.readFileSync(path.resolve("./") + "/assets/ssl/privkey.pem"),
    cert: fs.readFileSync(path.resolve("./") + "/assets/ssl/fullchain.pem")
}, EXPRESS_APP).listen(8050)

export const IO = new Server(HTTP_SERVER)

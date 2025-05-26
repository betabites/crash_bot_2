import {setup} from "./bot/index.js"
import {configureNext} from "./getHttpServer.js";
import dotenv from "dotenv";

dotenv.config()

Promise.allSettled([
    configureNext(),
    setup()
])
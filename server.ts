import {setup} from "./src/bot/index.ts"
import {configureNext} from "./src/bot/misc/getHttpServer.ts";

Promise.allSettled([
    configureNext(),
    setup()
])
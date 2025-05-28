import RemoteStatusServer from "../RemoteStatusServer/index.js";
import {ConnectionHandler} from "../RemoteStatusServer/connectionHandler.js";
import {IO} from "../getHttpServer.js";

const Server = new RemoteStatusServer([{clientId: "production", secret: "pczWlxfMzPmuI6yjQMaQYA=="}] as const)
export const Connection = Server.connectionHandlers.get("production") as ConnectionHandler

export default Server

async function configureIO() {
    Server.bindIO(await IO)
}
configureIO()
import RemoteStatusServer from "@/RemoteStatusServer/index.js";
import {ConnectionHandler} from "@/RemoteStatusServer/connectionHandler.js";

const Server = new RemoteStatusServer([{clientId: "production", secret: "pczWlxfMzPmuI6yjQMaQYA=="}] as const)
export const Connection = Server.connectionHandlers.get("production") as ConnectionHandler

export default Server

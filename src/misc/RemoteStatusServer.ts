import RemoteStatusServer from "@/RemoteStatusServer/index.ts";
import {ConnectionHandler} from "@/RemoteStatusServer/connectionHandler.ts";

const Server = new RemoteStatusServer([{clientId: "production", secret: "pczWlxfMzPmuI6yjQMaQYA=="}] as const)
export const Connection = Server.connectionHandlers.get("production") as ConnectionHandler

export default Server

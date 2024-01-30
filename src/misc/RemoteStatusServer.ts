import RemoteStatusServer from "../../RemoteStatusServer/index.js";

const Server = new RemoteStatusServer("hrX7mRR6wUchfwdnRdJ80NpD4XvVGMn0s6oCMY/nXFk=",
    [
        "pczWlxfMzPmuI6yjQMaQYA==",
        // "pczWlxfMzPmuI6yjQMaQYA==2"
    ]
)

export const Connection = Server.connections["pczWlxfMzPmuI6yjQMaQYA=="]

export default Server
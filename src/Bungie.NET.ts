import {BasicBungieClient} from "bungie-net-core/lib/client.js";
import {getDestinyManifest} from "bungie-net-core/lib/endpoints/Destiny2/index.js";

const client = new BasicBungieClient();

export function getManifest() {
    return getDestinyManifest(client)
}
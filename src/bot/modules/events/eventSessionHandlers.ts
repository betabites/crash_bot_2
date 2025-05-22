import {BasicEventSessionHandler} from "./BasicEventSessionHandler.js";
import {Client} from "discord.js";
import {EVENT_IDS} from "../GameAchievements.js";

export class OtherEventSessionHandler extends BasicEventSessionHandler {
    constructor(client: Client) {
        super(client, EVENT_IDS.OTHER);
    }
}

export class ChillEventSessionHandler extends BasicEventSessionHandler {
    constructor(client: Client) {
        super(client, EVENT_IDS.CHILL);
    }
}
export class MovieTVShowEventSessionHandler extends BasicEventSessionHandler {
    constructor(client: Client) {
        super(client, EVENT_IDS.MOVIE_OR_TV);
    }
}

export class AmongUsEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "Among Us",
        thumbnail: "https://easydrawingguides.com/wp-content/uploads/2023/01/how-to-draw-the-among-us-imposter-featured-image-1200.png"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.AMONG_US);
    }
}
export class SpaceEngineersEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "Space Engineers",
        thumbnail: "https://image.api.playstation.com/vulcan/ap/rnd/202210/0310/02a2vW74swzcIMFIDBJX5qq6.jpg"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.SPACE_ENGINEERS);
    }
}
export class LethalCompanyEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "The Company implores you to join",
        thumbnail: "https://cdn.mos.cms.futurecdn.net/ABYZEGXUnkHFEWW8XDKdiH.jpg"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.LETHAL_COMPANY);
    }
}

export class BoplBattleCompanyEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "Eat balls",
        thumbnail: "https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/1686940/ee70d024876f068095b8540cefbecfff417bcb96.jpg"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.BOPL_BATTLE);
    }
}

export class MinecraftEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "Minecraft",
        thumbnail: "https://cdn1.vox-cdn.com/thumbor/zfUQE6vrHeQ-nffQApdxNEgZKEI=/0x0:1280x720/1280x720/cdn0.vox-cdn.com/uploads/chorus_image/image/43551360/minecraft_ps4_edition.0.0.jpg"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.MINECRAFT);
    }
}
export class PhasmophobiaEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "The ghost is sus",
        thumbnail: "https://i.ytimg.com/vi/fkYQxOBJtwo/maxresdefault.jpg?sqp=-oaymwEmCIAKENAF8quKqQMa8AEB-AH-CYAC0AWKAgwIABABGGUgXihWMA8=&rs=AOn4CLCI-r4tjrHM1et9kBNQ0-UOe-trDg"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.PHASMOPHOBIA);
    }
}
export class BorderlandsEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "Craig fan club meeting",
        thumbnail: "https://store-images.s-microsoft.com/image/apps.6918.71029176982638972.07f274c3-060d-4786-b7b2-69156454002c.f734cca8-3108-47a0-be71-e178fc3d1ff8?mode=scale&q=90&h=1080&w=1920"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.BORDERLANDS);
    }
}
export class EscapistsEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "Escapists",
        thumbnail: "https://img.succesone.fr/2021/02/The-Escapists-Series-SuccesOneFR.jpg"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.ESCAPISTS);
    }
}
export class GModEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "GMod",
        thumbnail: "https://steamuserimages-a.akamaihd.net/ugc/548635111992996810/8840FCDC275813C708694962E917B16986E3139D/"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.GMOD);
    }
}
export class NorthgardEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "Northgard",
        thumbnail: "https://cdn.akamai.steamstatic.com/steam/apps/466560/ss_bcf982c0ac84677458c7c23a0eda09f59076319b.1920x1080.jpg?t=1674140986"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.NORTHGARD);
    }
}
export class OhDeerEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "Oh Deer!",
        thumbnail: "https://rewildingeurope.com/wp-content/uploads/2018/05/SWD-2013-05-24-084625_01.jpg"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.OH_DEER);
    }
}
export class ProjectPlaytimeEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "Project Playtime",
        thumbnail: "https://duckduckgo.com/?q=project+playtime&t=ffab&atb=v312-1&iar=images&iax=images&ia=images&iai=https%3A%2F%2Fgameplay.tips%2Fwp-content%2Fuploads%2F2022%2F12%2Fproject-playtime-4.jpg"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.PROJECT_PLAYTIME);
    }
}
export class TerrariaEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "Pixels can't hurt you",
        thumbnail: "https://gamingbolt.com/wp-content/uploads/2019/06/Terraria.jpg"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.TERRARIA);
    }
}
export class WarframeEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "Destiny 2 denial (Warframe)",
        thumbnail: "https://giocareora.com/wp-content/uploads/2019/11/1573737283_Come-ottenere-Warframe-Prime-in-Warframe.jpg"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.WARFRAME);
    }
}

export class WhosYourDaddyEventSessionHandler extends BasicEventSessionHandler {
    embedConfig = {
        title: "Who's your daddy!?",
        thumbnail: "https://images.purexbox.com/daf49f2166966/whos-your-daddy-is-still-one-of-xboxs-most-popular-games.large.jpg"
    }
    constructor(client: Client) {
        super(client, EVENT_IDS.WHOS_YOUR_DADDY);
    }
}

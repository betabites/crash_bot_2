import express from "express";
import SafeQuery from "../misc/SQL.js";
import mssql from "mssql";
import {UploadedFile} from "express-fileupload";
import path from "path";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ytdl from "ytdl-core";
import archiver from "archiver";

export const PACK_ROUTER = express.Router()

async function generatePack(pack_id: string, increase_version_num = false, onFile = (file: Buffer, location: string) => {
}, onPackFound = (p: any) => {
}) {
    let pack = (await SafeQuery("SELECT * FROM dbo.Packs WHERE pack_id = @packid", [
        {name: "packid", type: mssql.TYPES.Int(), data: parseInt(pack_id)}
    ])).recordset[0]

    if (increase_version_num) {
        if (pack.version_num_3 < 255) {
            pack.version_num_3 += 1
        }
        else if (pack.version_num_2 < 255) {
            pack.version_num_2 += 1
            pack.version_num_3 = 0
        }
        else if (pack.version_num_1 < 255) {
            pack.version_num_3 = 0
            pack.version_num_2 = 0
            pack.version_num_1 += 1
        }
        else {
            console.log("VERSION NUMBERS EXCEEDED")
        }
        await SafeQuery("UPDATE CrashBot.dbo.Packs SET version_num_1 = @n1, version_num_2 = @n2, version_num_3 = @n3 WHERE pack_id = @packid;", [
            {name: "n1", type: mssql.TYPES.TinyInt(), data: pack.version_num_1},
            {name: "n2", type: mssql.TYPES.TinyInt(), data: pack.version_num_2},
            {name: "n3", type: mssql.TYPES.TinyInt(), data: pack.version_num_3},
            {name: "packid", type: mssql.TYPES.Int(), data: parseInt(pack_id)}
        ])
    }
    onPackFound(pack)

    // Load sounds
    console.log("LOADING SOUNDS")
    let sounds: any[] = (await SafeQuery("SELECT * FROM dbo.PackSounds WHERE PackID = @packid", [
        {name: "packid", type: mssql.TYPES.Int(), data: parseInt(pack_id)}
    ])).recordset

    // Check for sounds that are not default
    let sounds_folder = path.join(path.resolve("./"), "assets", "pack_sounds")
    for (let sound of sounds) {
        sound.changed = fs.existsSync(path.join(sounds_folder, sound.SoundID + ".ogg"))
    }

    // Load sound definitions
    console.log("LOADING SOUND DEFINITIONS")
    let sound_definitons: any[] = (await SafeQuery("SELECT * FROM dbo.PackSoundDefinitions WHERE PackID = @packid", [
        {name: "packid", type: mssql.TYPES.Int(), data: parseInt(pack_id)}
    ])).recordset

    console.log("EXPORTING SOUNDS")
    let sound_definitions_out: any = {
        "format_version": "1.14.0",
        "sound_definitions": {}
    }

    // Parse sound definitions into sound definitions JSON file
    for (let definition of sound_definitons) {
        // Check all linked sounds
        let linked_sounds = sounds.filter(sound => sound.SoundDefID === definition.SoundDefID)
        if (linked_sounds.length === 0 || linked_sounds.filter(sound => sound.changed).length === 0) {
            definition.changed = false
            continue
        } // Ignore this definition as it has not changed.
        definition.changed = true
        sound_definitions_out.sound_definitions[definition.Name] = {
            category: definition.category,
            sounds: linked_sounds.map(sound => {
                return {
                    is3D: sound.is3D,
                    volume: sound.volume,
                    pitch: sound.pitch,
                    weight: sound.weight,
                    name: sound.changed ? "sounds/i/" + sound.SoundID : sound.DefaultFile
                }
            })
        }
    }

    // Append files to archive
    console.log("APPENDING SOUNDS TO ARCHIVE")
    console.log(sound_definitions_out)
    for (let sound of sounds.filter(sound => sound.changed)) {
        onFile(fs.readFileSync(path.join(sounds_folder, sound.SoundID + ".ogg")), "sounds/i/" + sound.SoundID + ".ogg")
    }

    // // Cleanup
    // delete sounds

    // Export sound groups
    let sound_groups = (await SafeQuery("SELECT * FROM dbo.PackSoundGroups WHERE PackSoundGroups.PackID = @packid", [
        {name: "packid", type: mssql.TYPES.Int(), data: parseInt(pack_id)}
    ])).recordset

    let sound_groups_out: any = {
        "block_sounds": {},
        "entity_sounds": {entities: {}},
        "individual_event_sounds": {
            "events": {}
        },
        "interactive_sounds": {
            "block_sounds": {},
            "entity_sounds": {
                "defaults": {
                    "events": {
                        "fall": {
                            "default": {
                                "pitch": 0.750,
                                "sound": "",
                                "volume": 1.0
                            }
                        },
                        "jump": {
                            "default": {
                                "pitch": 0.750,
                                "sound": "",
                                "volume": 0.250
                            }
                        }
                    },
                    "pitch": 1.0,
                    "volume": 0.250
                },
                "entities": {}
            }
        }
    }
    for (let item of sound_groups) {
        let events: any[] = (await SafeQuery("SELECT * FROM dbo.PackSoundGroupEvents WHERE PackSoundGroupEvents.SoundGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: item.SoundGroupID}
        ])).recordset

        let _events: any = {}

        for (let event of events) {
            // Check if event has changed
            let sound_definition = sound_definitons.find(definition => definition.SoundDefID === event.SoundDefID)
            event.definition = sound_definition

            _events[event.EventType] = {
                sound: event.definition.Name,
                volume: event.vol_lower === event.vol_higher ? event.vol_lower : [event.vol_lower, event.vol_higher],
                pitch: event.pitch_lower === event.pitch_higher ? event.pitch_lower : [event.pitch_lower, event.pitch_higher],
            }
        }

        if (!events.find(event => event.definition.changed)) continue

        let _item = {
            pitch: item.pitch_lower === item.pitch_higher ? item.pitch_lower : [item.pitch_lower, item.pitch_higher],
            volume: item.vol_lower === item.vol_higher ? item.vol_lower : [item.vol_lower, item.vol_higher],
            events: _events
        }

        if (item.type === "block_sounds") {
            sound_groups_out["block_sounds"][item.GroupName] = _item
        }
        else if (item.type === "entity_sounds") {
            sound_groups_out.entity_sounds.entities[item.GroupName] = _item
        }
        else if (item.type === "individual_event_sounds") {
            sound_groups_out.individual_event_sounds.events = _item
        }
        else if (item.type === "interactive_sounds.block_sounds") {
            sound_groups_out.interactive_sounds.block_sounds[item.GroupName] = _item.events
        }
        else if (item.type === "interactive_sounds.entity_sounds") {
            sound_groups_out.interactive_sounds.entity_sounds.entities[item.GroupName] = _item
        }
    }


    onFile(Buffer.from(JSON.stringify(sound_definitions_out)), "sounds/sound_definitions.json")
    onFile(Buffer.from(JSON.stringify(sound_groups_out)), "sounds.json")

    // Export terrain textures
    let terrain_textures_array = (await SafeQuery(`SELECT dbo.PackTextureGroups.GameID  AS 'identifier',
                                                          dbo.PackTextures.DefaultFile  AS 'DefaultFile',
                                                          dbo.PackTextures.OverlayColor AS 'OverlayColor',
                                                          dbo.PackTextures.TextureID
                                                   FROM dbo.PackTextureGroups
                                                            JOIN dbo.PackTextures ON dbo.PackTextures.TextureGroupID =
                                                                                     dbo.PackTextureGroups.TextureGroupID
                                                   WHERE dbo.PackTextureGroups.PackID = @packid
                                                     AND type = 'terrain_texture'
                                                   ORDER BY GameID ASC, Position ASC`, [
        {name: "packid", type: mssql.TYPES.Int(), data: pack_id}
    ])).recordset

    let terrain_textures: any = {
        num_mip_levels: 4, padding: 8, resource_pack_name: "vanilla", texture_data: {}
    }
    for (let texture of terrain_textures_array) {
        if (!terrain_textures.texture_data[texture.identifier]) {
            terrain_textures.texture_data[texture.identifier] = {textures: []}

            let _path = texture.DefaultFile
            if (fs.existsSync(path.join(path.resolve("./"), "assets", "pack_textures", texture.TextureID + ".png"))) {
                onFile(fs.readFileSync(path.join(path.resolve("./"), "assets", "pack_textures", texture.TextureID + ".png")), "textures/i/" + texture.TextureID + ".png")
                _path = "textures/i/" + texture.TextureID
            }

            if (texture.OverlayColor) {
                terrain_textures.texture_data[texture.identifier].textures.push({
                    overlay_color: "#" + texture.OverlayColor,
                    path: _path
                })
            }
            else terrain_textures.texture_data[texture.identifier].textures.push(_path)
        }
    }

    // Export blocks
    let blocks_array = (await SafeQuery(`
                SELECT PB.GameID AS 'GameID', PBT.Type AS 'type', PTG.GameID AS 'TextureGameID', PSG.GroupName AS 'SoundGameID'
                FROM dbo.PackBlocks PB
                         JOIN dbo.PackBlockTextures PBT on PB.BlockID = PBT.BlockID
                         JOIN dbo.PackTextureGroups PTG ON PBT.TextureGroupID = PTG.TextureGroupID
                         JOIN dbo.PackSoundGroups PSG on PB.SoundGroupID = PSG.SoundGroupID
                WHERE PB.PackID = @packid`,
        [
            {name: "packid", type: mssql.TYPES.Int(), data: pack_id}
        ])).recordset
    onFile(Buffer.from(JSON.stringify(terrain_textures)), "textures/terrain_texture.json")

    let blocks: any = {}
    for (let block of blocks_array) {
        if (!blocks[block.GameID]) blocks[block.GameID] = {textures: {}}
        if (block.SoundGameID) blocks[block.GameID].sound = block.SoundGameID
        blocks[block.GameID].textures[block.type] = block.TextureGameID
    }
    onFile(Buffer.from(JSON.stringify(blocks)), "blocks.json")

    onFile(Buffer.from(JSON.stringify({
        "format_version": 2,
        "header": {
            "description": "Re-Flesh SEASON 5",
            "name": "Re-Flesh SEASON 5",
            "uuid": "5eb74438-a581-4b21-97bf-c13e4c4522f5",
            "version": [pack.version_num_1, pack.version_num_2, pack.version_num_3],
            "min_engine_version": [1, 19, 50]
        },
        "modules": [
            {
                "description": "Example vanilla resource pack",
                "type": "resources",
                "uuid": "b1b947d5-dece-484d-a6c8-6a0c829d5d96",
                "version": [0, 0, 3]
            }
        ]
    })), "manifest.json")
    onFile(fs.readFileSync(path.join(path.resolve("./"), "assets", "pack", "pack_icon.png")), "pack_icon.png")
}

async function generatePackArchive(pack_id: string, increase_version_num = false, format: archiver.Format, options?: archiver.ArchiverOptions) {
    let archive = archiver(format, options)

    await generatePack(pack_id, increase_version_num, (file, location) => {
        archive.append(file, {name: location})
    })

    archive.finalize()
    return archive
}


PACK_ROUTER.get("/", async (req, res) => {
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify((await SafeQuery("SELECT pack_id, pack_name, \"public\" FROM dbo.Packs", [])).recordset))
})
PACK_ROUTER.get("/:packid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT pack_id, pack_name, \"public\" FROM dbo.Packs WHERE pack_id = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    if (data.recordset.length === 1) res.send(JSON.stringify(data.recordset[0]))
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

PACK_ROUTER.get("/:packid/file.zip", async (req, res) => {
    // Convert the resource pack to a .mcpack file
    (await generatePackArchive(req.params.packid, false, "zip")).pipe(res)
})

PACK_ROUTER.get("/:packid/blocks", async (req, res) => {
    let data = await SafeQuery("SELECT BlockID, GameID, SoundGroupID FROM dbo.PackBlocks WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find textures
        let textures = await SafeQuery("SELECT TextureGroupID, Type FROM dbo.PackBlockTextures WHERE BlockID = @blockid AND PackID = @packid", [
            {name: "packid", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
            {name: "blockid", type: mssql.TYPES.Int(), data: item.BlockID}
        ])
        item.texture_groups = textures.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

PACK_ROUTER.get("/:packid/blocks/:blockid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT BlockID, GameID, SoundGroupID FROM dbo.PackBlocks WHERE PackID = @id AND BlockID = @blockid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "blockid", type: mssql.TYPES.Int(), data: parseInt(req.params.blockid)}
    ])
    if (data.recordset.length === 1) {
        data.recordset[0].texture_groups = (await SafeQuery("SELECT TextureGroupID, Type FROM dbo.PackBlockTextures WHERE BlockID = @blockid AND PackID = @packid", [
            {name: "packid", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
            {name: "blockid", type: mssql.TYPES.Int(), data: parseInt(req.params.blockid)}
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

PACK_ROUTER.get("/:packid/entities", async (req, res) => {
    let data = await SafeQuery("SELECT EntityID, identifier, SoundGroupID, InteractiveSoundGroupID FROM dbo.PackEntities WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find textures
        let textures = await SafeQuery("SELECT TextureID, Type FROM dbo.PackEntityTextures WHERE EntityID = @entity", [
            {name: "entity", type: mssql.TYPES.Int(), data: item.EntityID}
        ])
        item.textures = textures.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

PACK_ROUTER.get("/:packid/entities/:entityid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT EntityID, identifier, InteractiveSoundGroupID, SoundGroupID FROM dbo.PackEntities WHERE PackID = @id AND EntityID = @entityid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "entityid", type: mssql.TYPES.Int(), data: parseInt(req.params.entityid)}
    ])
    if (data.recordset.length === 1) {
        // Find textures
        data.recordset[0].textures = (await SafeQuery("SELECT TextureID, Type FROM dbo.PackEntityTextures WHERE EntityID = @entity", [
            {name: "entity", type: mssql.TYPES.Int(), data: data.recordset[0].EntityID}
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

PACK_ROUTER.get("/:packid/textures/groups", async (req, res) => {
    let data = await SafeQuery("SELECT TextureGroupID, GameID, type FROM dbo.PackTextureGroups WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find textures
        let textures = await SafeQuery("SELECT TextureID, Position, OverlayColor FROM dbo.PackTextures WHERE TextureGroupID = @id ORDER BY Position ASC", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(item.TextureGroupID)},
        ])
        item.textures = textures.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

PACK_ROUTER.get("/:packid/textures/groups/:groupid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT TextureGroupID, GameID, type FROM dbo.PackTextureGroups WHERE PackID = @id AND TextureGroupID = @groupid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "groupid", type: mssql.TYPES.Int(), data: parseInt(req.params.groupid)}
    ])

    if (data.recordset.length === 1) {
        data.recordset[0].textures = (await SafeQuery("SELECT TextureID, Position, OverlayColor FROM dbo.PackTextures WHERE TextureGroupID = @id ORDER BY Position ASC", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(data.recordset[0].TextureGroupID)},
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

PACK_ROUTER.get("/:packid/textures/", async (req, res) => {
    let data = await SafeQuery("SELECT TextureID, TextureGroupID, Position, OverlayColor FROM dbo.PackTextures WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

PACK_ROUTER.get("/:packid/textures/:textureid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT TextureID, TextureGroupID, Position, OverlayColor FROM dbo.PackTextures WHERE PackID = @id AND TextureID = @textureid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "textureid", type: mssql.TYPES.Int(), data: parseInt(req.params.textureid)}
    ])

    if (data.recordset.length === 1) {
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

PACK_ROUTER.post("/:packid/textures/:textureid/upload", async (req, res) => {
    let file = req.files?.file as UploadedFile
    if (!file) {
        res.send("No file attached")
        return
    }
    else if (file.name.endsWith(".png")) {
        res.send("PNGs only")
        return
    }

    file.mv(path.join(path.resolve("./"), "assets", "pack_textures", req.params.textureid.toString() + ".png")).then(r => {
        res.send("OK!")
    })
})

PACK_ROUTER.get("/:packid/textures/:textureid/stream", async (req, res) => {
    let data = await SafeQuery("SELECT TextureID, DefaultFile FROM dbo.PackTextures WHERE PackID = @id AND TextureID = @textureid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "textureid", type: mssql.TYPES.Int(), data: parseInt(req.params.textureid)}
    ])

    if (data.recordset.length === 1) {
        let _path = path.join(path.resolve("./"), "assets", "pack_textures", data.recordset[0].TextureID.toString() + ".png")
        if (fs.existsSync(_path)) res.sendFile(_path)
        else res.sendFile(path.join(path.resolve("./"), "assets", "pack", data.recordset[0].DefaultFile + ".png"))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

PACK_ROUTER.get("/:packid/textures/:textureid/stream/original", async (req, res) => {
    let data = await SafeQuery("SELECT TextureID, DefaultFile FROM dbo.PackTextures WHERE PackID = @id AND TextureID = @textureid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "textureid", type: mssql.TYPES.Int(), data: parseInt(req.params.textureid)}
    ])

    if (data.recordset.length === 1) {
        res.sendFile(path.join(path.resolve("./"), "assets", "pack", data.recordset[0].DefaultFile + ".png"))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

PACK_ROUTER.get("/:packid/sounds/groups", async (req, res) => {
    let data = await SafeQuery("SELECT SoundGroupID, pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type FROM dbo.PackSoundGroups WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find sound events
        let events = await SafeQuery("SELECT EventID, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID, EventType FROM dbo.PackSoundGroupEvents WHERE SoundGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(item.SoundGroupID)},
        ])
        item.events = events.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

PACK_ROUTER.get("/:packid/sounds/groups/:groupid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT SoundGroupID, pitch_lower, pitch_higher, vol_lower, vol_higher, GroupName, type FROM dbo.PackSoundGroups WHERE PackID = @id AND SoundGroupID = @groupid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "groupid", type: mssql.TYPES.Int(), data: parseInt(req.params.groupid)}
    ])

    if (data.recordset.length === 1) {
        data.recordset[0].events = (await SafeQuery("SELECT EventID, pitch_lower, pitch_higher, vol_lower, vol_higher, SoundDefID, EventType FROM dbo.PackSoundGroupEvents WHERE SoundGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(data.recordset[0].SoundGroupID)},
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

PACK_ROUTER.get("/:packid/sounds/definitions", async (req, res) => {
    let data = await SafeQuery("SELECT SoundDefID, Name FROM dbo.PackSoundDefinitions WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    for (let item of data.recordset) {
        // Find sounds
        let sounds = await SafeQuery("SELECT SoundID, is3D, volume, pitch, weight FROM dbo.PackSounds WHERE SoundDefID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(item.SoundDefID)},
        ])
        item.sounds = sounds.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

PACK_ROUTER.get("/:packid/sounds/definitions/:groupid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT SoundDefID, Name FROM dbo.PackSoundDefinitions WHERE PackID = @id AND SoundDefID = @groupid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "groupid", type: mssql.TYPES.Int(), data: parseInt(req.params.groupid)}
    ])

    if (data.recordset.length === 1) {
        data.recordset[0].sounds = (await SafeQuery("SELECT SoundID, is3D, volume, pitch, weight FROM dbo.PackSounds WHERE SoundDefID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(data.recordset[0].SoundDefID)},
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

PACK_ROUTER.get("/:packid/sounds/", async (req, res) => {
    let data = await SafeQuery("SELECT SoundID, SoundDefID, is3D, pitch, volume, weight, enabled FROM dbo.PackSounds WHERE PackID = @id; SELECT @@IDENTITY AS NewID", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

PACK_ROUTER.post("/:packid/sounds/", express.json(), async (req, res) => {
    let requirements = ["SoundDefID", "is3D", "volume", "pitch", "weight", "enabled"]
    for (let item of requirements) if (typeof req.body[item] === "undefined") {
        res.status(400)
        res.send("Missing parameter: " + item)
        return
    }

    let data: mssql.IResult<{
        NewID: string
    }> = await SafeQuery("INSERT INTO CrashBot.dbo.PackSounds (SoundDefID, is3D, volume, pitch, weight, enabled, PackID) VALUES (@sounddef, @is3D, @volume, @pitch, @weight, @enabled, @packid); SELECT @@IDENTITY AS NewID;", [
        {name: "sounddef", type: mssql.TYPES.Int(), data: req.body.SoundDefID},
        {name: "is3D", type: mssql.TYPES.Bit(), data: req.body.is3D},
        {name: "volume", type: mssql.TYPES.Int(), data: req.body.volume},
        {name: "pitch", type: mssql.TYPES.Int(), data: req.body.pitch},
        {name: "weight", type: mssql.TYPES.Int(), data: req.body.weight},
        {name: "enabled", type: mssql.TYPES.Int(), data: req.body.enabled},
        {name: "packid", type: mssql.TYPES.Int(), data: req.params.packid}
    ])
    res.setHeader("content-type", "application/json")
    console.log(data)
    res.send(JSON.stringify({
        SoundID: data.recordsets[0][0].NewID
    }))
})

PACK_ROUTER.post("/:packid/sounds/:soundid", express.json(), async (req, res) => {
    let requirements = ["SoundDefID", "is3D", "volume", "pitch", "weight", "enabled"]
    for (let item of requirements) if (typeof req.body[item] === "undefined") {
        res.status(400)
        res.send("Missing parameter: " + item)
        return
    }

    let data = await SafeQuery("UPDATE CrashBot.dbo.PackSounds SET SoundDefID = @sounddef, is3D = @is3D, volume = @volume, pitch = @pitch, weight = @weight, enabled = @enabled WHERE SoundID = @id", [
        {name: "sounddef", type: mssql.TYPES.Int(), data: req.body.SoundDefID},
        {name: "is3D", type: mssql.TYPES.Bit(), data: req.body.is3D},
        {name: "volume", type: mssql.TYPES.Int(), data: req.body.volume},
        {name: "pitch", type: mssql.TYPES.Int(), data: req.body.pitch},
        {name: "weight", type: mssql.TYPES.Int(), data: req.body.weight},
        {name: "enabled", type: mssql.TYPES.Int(), data: req.body.enabled},
        {name: "id", type: mssql.TYPES.Int(), data: req.params.soundid}
    ])
    res.setHeader("content-type", "application/json")
    console.log(data)
    res.send(JSON.stringify({
        SoundID: req.params.soundid
    }))
})

PACK_ROUTER.post("/:packid/sounds/:soundid/upload", async (req, res) => {
    console.log(req)
    let file = req.files?.file as UploadedFile
    if (typeof file === "undefined") {
        res.status(400)
        res.send("File not attached")
        return
    }

    if (!(file.name.endsWith(".mp3") || file.name.endsWith(".wav"))) {
        res.send(400)
        res.send("Unsupported file type")
    }

    let output = path.join(path.resolve("./"), "assets", "pack_sounds", req.params.soundid + ".ogg")
    if (fs.existsSync(output)) fs.unlinkSync(output)
    let name = file.name.split(".")
    let location = file.tempFilePath + "." + name[name.length - 1]
    file.mv(location).then(r => {
        console.log("TRANSPOSING")
        ffmpeg(location)
            .output(output)
            .audioChannels(1)
            .audioBitrate("112k")
            .audioQuality(3)
            .audioFrequency(22050)
            .on('end', () => {
                res.send("OK!")
            })
            .on("error", (e) => {
                console.log(e)
            })
            .run()
    })
})

PACK_ROUTER.post("/:packid/sounds/:soundid/ytupload", express.json(), async (req, res) => {
    console.log(req.body)
    let video_info = await ytdl.getInfo(ytdl.getURLVideoID(req.body.yturi))

    if (parseInt(video_info.videoDetails.lengthSeconds) > 420) {
        res.send("TOO LONG")
        return
    }
    let output = path.join(path.resolve("./"), "assets", "pack_sounds", req.params.soundid + ".ogg")

    if (fs.existsSync(output)) fs.unlinkSync(output)

    let stream = await ytdl(req.body.yturi, {quality: "highestaudio"})
    console.log(stream)
    ffmpeg(stream)
        .output(output)
        .audioChannels(1)
        .audioBitrate("112k")
        .audioQuality(3)
        .on("end", () => {
            console.log("OK")
        })
        .on("error", (e) => {
            console.log(e)
        })
        .noVideo()
        .run()
    res.send("OK")
})

PACK_ROUTER.get("/:packid/sounds/:soundid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT SoundID, SoundDefID, is3D, pitch, volume, weight, enabled FROM dbo.PackSounds WHERE PackID = @id AND SoundID = @soundid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "soundid", type: mssql.TYPES.Int(), data: parseInt(req.params.soundid)}
    ])

    if (data.recordset.length === 1) {
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

PACK_ROUTER.get("/:packid/sounds/:soundid/stream", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT SoundID, SoundDefID, is3D, pitch, volume, weight FROM dbo.PackSounds WHERE PackID = @id AND SoundID = @soundid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "soundid", type: mssql.TYPES.Int(), data: parseInt(req.params.soundid)}
    ])

    if (data.recordset.length === 1) {
        let _path = path.join(path.resolve("./"), "assets", "pack_sounds", data.recordset[0].SoundID.toString() + ".ogg")
        if (fs.existsSync(_path)) res.sendFile(_path)
        else res.sendFile(path.join(path.resolve("./"), "assets", "pack_sounds", "template.mp3"))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

PACK_ROUTER.get("/:packid/items/", async (req, res) => {
    let data = await SafeQuery("SELECT ItemID, TextureGroupID, GameID FROM dbo.PackItems WHERE PackID = @id", [
        {
            name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)
        }
    ])

    for (let item of data.recordset) {
        // Find sound events
        let textures = await SafeQuery("SELECT TextureID, Position, OverlayColor FROM dbo.PackTextures WHERE TextureGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(item.TextureGroupID)},
        ])
        item.textures = textures.recordset
    }
    res.setHeader("content-type", "application/json")
    res.send(JSON.stringify(data.recordset))
})

PACK_ROUTER.get("/:packid/items/:itemid", async (req, res) => {
    res.setHeader("content-type", "application/json")
    let data = await SafeQuery("SELECT ItemID, TextureGroupID, GameID FROM dbo.PackItems WHERE PackID = @id AND ItemID = @itemid", [
        {name: "id", type: mssql.TYPES.Int(), data: parseInt(req.params.packid)},
        {name: "itemid", type: mssql.TYPES.Int(), data: parseInt(req.params.itemid)}
    ])

    if (data.recordset.length === 1) {
        data.recordset[0].textures = (await SafeQuery("SELECT TextureID, Position, OverlayColor FROM dbo.PackTextures WHERE TextureGroupID = @id", [
            {name: "id", type: mssql.TYPES.Int(), data: parseInt(data.recordset[0].TextureGroupID)},
        ])).recordset
        res.send(JSON.stringify(data.recordset[0]))
    }
    else {
        res.status(404)
        res.send("{\"error\":404}")
    }
})

PACK_ROUTER.get("/:packid/languages/items", async (req, res) => {
    if (req.query.language) {
        console.log(req.query.language)
        let languages = await SafeQuery("SELECT * FROM dbo.PackLanguages WHERE PackID = @packid", [
            {name: "packid", type: mssql.TYPES.Int(), data: req.params.packid}
        ])

    }
    else {
        let language_items = (await SafeQuery("SELECT * FROM dbo.PackLanguageItems WHERE PackID = @packid", [
            {name: "packid", type: mssql.TYPES.Int(), data: req.params.packid}
        ])).recordset

        let out: any = {}
        for (let item of language_items) {
            if (!out[item.GameItem]) out[item.GameItem] = {}
            out[item.GameItem][item.LanguageID] = item.Text
        }
        res.header("content-type", "application/json")
        res.send(JSON.stringify(out))
    }
})
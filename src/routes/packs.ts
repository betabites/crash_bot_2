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
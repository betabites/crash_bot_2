import fs from "fs";
import path from "path";
import {SafeQuery} from "./SQL.js";
import mssql from "mssql";
import {GuildMember} from "discord.js";
import * as stream from "stream";
import archiver from "archiver";

interface OSFileSystemItem {
    path: string,
    name: string,
    type: "file" | "folder"
}

interface OSFileSystemFile extends OSFileSystemItem {
    type: "file"
}

interface OSFileSystemFolder extends OSFileSystemItem {
    type: "folder",
    children: OSFileSystemItem[]
}

export let searchIndex: string[] = []

export function dirTree(filename: string, parentFolder = ""): OSFileSystemFile | OSFileSystemFolder {
    if (parentFolder === "") {
        parentFolder = filename
    }

    let stats = fs.lstatSync(filename)
    let info: OSFileSystemFile | OSFileSystemFolder

    if (stats.isDirectory()) {
        info = {
            path: filename.replace(parentFolder, ""),
            name: path.basename(filename, parentFolder),
            type: "folder",
            children: fs.readdirSync(filename).map(function (child) {
                return dirTree(filename + '/' + child, parentFolder);
            })
        } as OSFileSystemFolder
    }
    else {
        // Assuming it's a file. In real life it could be a symlink or
        // something else!
        info = {
            path: filename.replace(parentFolder, ""),
            name: path.basename(filename, parentFolder),
            type: "file"
        } as OSFileSystemFile
    }

    return info;
}

export async function FindOwnership(path: string) {
    let req = await SafeQuery(`SELECT *
                               FROM dbo.OwnedItems
                               WHERE path = @path`, [{name: "path", type: mssql.TYPES.VarChar(200), data: path}])
    if (req.recordset.length === 0) throw "No ownership recorded for this path"
    return req.recordset[0]
}

setTimeout(async () => {
    searchIndex = searchIndexFlattener(dirTree(path.resolve("./") + "/assets/pack") as OSFileSystemFolder)
}, 10000)

let search_index_updater = setInterval(() => {
    searchIndex = searchIndexFlattener(dirTree(path.resolve("./") + "/assets/pack") as OSFileSystemFolder)
}, 30000)

function searchIndexFlattener(directory: OSFileSystemFolder) {
    let out: string[] = []
    for (let item of directory.children) {
        if (item.type === "folder") {
            out = out.concat(searchIndexFlattener(item as OSFileSystemFolder))
        }
        else {
            out.push(item.path)
        }
    }
    return out
}

export class BankResource {
    readonly name: string
    readonly tag_name: string
    stock: number
    max_inventory: number
    baseline_price: number
    constructor(
        name: string,
        tag_name: string,
        stock = 100,
        max_inventory = 1000,
        baseline_price = 0
    ) {
        this.name = name
        this.tag_name = tag_name
        this.stock = stock
        this.max_inventory = max_inventory
        this.baseline_price = baseline_price
        // this.restock_interval = setInterval(() => this.addToStock(1), restock_rate)
    }

    addToStock(add_count: number) {
        this.stock += add_count
        // wss.updateBank()
    }

    removeFromStock(remove_count: number) {
        this.stock -= remove_count
        // wss.updateBank()
    }

    calculateWorth() {
        console.log(this)
        return Math.round(((this.max_inventory - this.stock) / this.max_inventory) * 1000) + this.baseline_price
    }
}

export class Bank {
    resources: BankResource[];
    private bankBackup: NodeJS.Timer;

    constructor() {
        this.resources = []
        this.bankBackup = setInterval(() => {
            fs.writeFileSync(path.resolve("./") + "/assets/json/bank_backup.json", JSON.stringify(this.resources))
        }, 60000)
    }

    addTradeResource(resource: BankResource) {
        this.resources.push(resource)
    }
}

export function buildPack(name: string, output_stream?: stream.Writable): Promise<void> {
    return new Promise(resolve => {
        let output: stream.Writable
        if (output_stream) {
            output = output_stream
        }
        else {
            output = fs.createWriteStream(path.resolve("./") + '/' + name)
        }
        console.log(path.resolve("./") + '/' + name)
        let archive = archiver('zip');

        output.on('close', function () {
            try {
                // @ts-ignore
                output.close()
            } catch (e) {
            }
            resolve()
        });

        archive.on('error', function (err) {
            throw err;
        });

        archive.pipe(output);

        // append files from a sub-directory, putting its contents at the root of archive
        archive.directory(path.resolve("./") + "/assets/pack", false);

        archive.finalize();
    })
}
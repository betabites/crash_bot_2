import {google} from "googleapis";
import {CloudTasksClient} from "@google-cloud/tasks";
import {PubSub as GCPPubSub} from "@google-cloud/pubsub"

const PROJECT_ID = "re-flesh"
const ZONE = "us-central1-f"
const INSTANCE = "pterodactyl-server-us"
const CLOUD_TASK_QUEUE = "pterodactyl-shutdown-schedule"
const SERVICE_EMAIL = "crashbot@re-flesh.iam.gserviceaccount.com"

const authResult = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
})
const computeEngine = google.compute("v1")
const tasksClient = new CloudTasksClient({auth: authResult});

export async function getPterodactylInstanceStatus() {
    let info = await computeEngine.instances.get({
        project: PROJECT_ID,
        zone: ZONE,
        instance: INSTANCE,
        auth: authResult
    })
    return info.data.status
}

export async function startPterodactylInstance() {
    await computeEngine.instances.start({
        project: PROJECT_ID,
        zone: ZONE,
        instance: INSTANCE,
        auth: authResult
    })
}

export async function stopPterodactylInstance() {
    let info = await computeEngine.instances.stop({
        project: PROJECT_ID,
        zone: ZONE,
        instance: INSTANCE,
        auth: authResult
    })
}

export async function resetPterodactylInstance() {
    let info = await computeEngine.instances.reset({
        project: PROJECT_ID,
        zone: ZONE,
        instance: INSTANCE,
        auth: authResult
    })
}

export async function clearShutdownTasks() {
    const parent = tasksClient.queuePath(PROJECT_ID, "northamerica-northeast1", CLOUD_TASK_QUEUE)
    // First, check if a task already exists
    let [tasks] = await tasksClient.listTasks({
        parent
    })
    for (let task of tasks) void tasksClient.deleteTask(task)
}

export async function scheduleShutdown(inSeconds: number = 3000) {
    const parent = tasksClient.queuePath(PROJECT_ID, "northamerica-northeast1", CLOUD_TASK_QUEUE)
    await clearShutdownTasks()

    console.log(`${parent}/tasks/shutdown-pterodactyl-${Math.floor(Math.random() * 10000)}`)

    // if (inSeconds > 60 * 5) {
    //     // Schedule an 'in 5 minutes' notification
    //     await tasksClient.createTask({
    //         parent,
    //         task: {
    //             name: `${parent}/tasks/shutdown-notification-pterodactyl-${Math.floor(Math.random() * 10000)}`,
    //             httpRequest: {
    //                 httpMethod: "POST",
    //                 url: "https://us-central1-re-flesh.cloudfunctions.net/pterodactyl-shutdown-warning",
    //                 headers: {
    //                     "Content-Type": "application/json"
    //                 },
    //                 body: Buffer.from("{}").toString('base64'),
    //                 oidcToken: {
    //                     serviceAccountEmail: SERVICE_EMAIL
    //                 }
    //             },
    //             scheduleTime: {
    //                 seconds: (Date.now() / 1000) + (inSeconds - (60 * 5))
    //             }
    //         }
    //     })
    // }

    await tasksClient.createTask({
        parent,
        task: {
            name: `${parent}/tasks/shutdown-pterodactyl-${Math.floor(Math.random() * 10000)}`,
            httpRequest: {
                httpMethod: "POST",
                url: "https://us-central1-re-flesh.cloudfunctions.net/shutdown-pterodactyl",
                headers: {
                    "Content-Type": "application/json"
                },
                body: Buffer.from("{}").toString('base64'),
                oidcToken: {
                    serviceAccountEmail: SERVICE_EMAIL
                }
            },
            scheduleTime: {
                seconds: (Date.now() / 1000) + inSeconds
            }
        }
    })
}


// CONFIGURE PUBSUB
export const PubSub = new GCPPubSub({projectId: PROJECT_ID, auth: authResult})

export interface AcknowledgementMessage {
    error?: unknown
}

// FOR MESSAGES SENT TO THE AUDIO MANAGER
export enum AUDIO_MANAGER_MESSAGE_TYPES {
    ACKNOWLEDGEMENT,
    CONNECT_CHANNEL,
    START_STREAM,
    STOP_STREAM,
    PAUSE_PLAY_STREAM,
}

export interface messageToAudioManager<T extends AUDIO_MANAGER_MESSAGE_TYPES> {
    id: string,
    type: T,
    data: AudioManagerData[T]
}

interface AudioManagerData {
    [AUDIO_MANAGER_MESSAGE_TYPES.ACKNOWLEDGEMENT]: AcknowledgementMessage
    [AUDIO_MANAGER_MESSAGE_TYPES.CONNECT_CHANNEL]: ConnectMessage
    [AUDIO_MANAGER_MESSAGE_TYPES.START_STREAM]: StreamStartMessage
    [AUDIO_MANAGER_MESSAGE_TYPES.STOP_STREAM]: GuildID
    [AUDIO_MANAGER_MESSAGE_TYPES.PAUSE_PLAY_STREAM]: GuildID
}

export interface ConnectMessage {
    guildId: string,
    channelId: string
}

export interface StreamStartMessage {
    guildId: string,
    youtubeUrl: string
}

// FOR MESSAGES SENT TO THE VOICE MANAGER
export enum VOICE_MANAGER_MESSAGE_TYPES {
    ACKNOWLEDGEMENT,
    PLAYER_IDLING,
}

export interface messageToVoiceManager<T extends VOICE_MANAGER_MESSAGE_TYPES> {
    id: string,
    type: T,
    data: VoiceManagerData[T]
}

interface VoiceManagerData {
    [VOICE_MANAGER_MESSAGE_TYPES.ACKNOWLEDGEMENT]: AcknowledgementMessage
    [VOICE_MANAGER_MESSAGE_TYPES.PLAYER_IDLING]: GuildID
}

type GuildID = string
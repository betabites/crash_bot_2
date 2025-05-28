"use client"
import {createContext, ReactNode, useEffect, useState} from "react";

const AudioContext = createContext(null);

export function AudioContextProvider(props: { children: ReactNode }) {
    const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)
    const [volume, setVolume] = useState(0.05)

    useEffect(() => {
        let audioEl = new Audio("/audio/menu_theme.mp3")
        setAudioEl(audioEl)
        audioEl.play()
        audioEl.volume = volume
        audioEl.loop = true
        return () => {
            audioEl.pause()
        }
    }, [])

    useEffect(() => {
        if (!audioEl) return
        audioEl.volume = volume
    }, [audioEl, volume])

    return <AudioContext.Provider value={null}>
        {props.children}
    </AudioContext.Provider>
}
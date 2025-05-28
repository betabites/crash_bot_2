"use client"
import {createContext, ReactNode, useEffect, useState} from "react";

const AudioContext = createContext(null);

export function AudioContextProvider(props: { children: ReactNode }) {
    const [audioEl, setAudioEl] = useState(new Audio("/audio/menu_theme.mp3"))
    const [volume, setVolume] = useState(0.05)

    useEffect(() => {
        audioEl.play()
        audioEl.volume = volume
        audioEl.loop = true
        return () => {
            audioEl.pause()
        }
    }, [])

    useEffect(() => {
        audioEl.volume = volume
    }, [audioEl, volume])

    return <AudioContext.Provider value={null}>
        {props.children}
    </AudioContext.Provider>
}
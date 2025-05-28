"use client"
import {useEffect, useState} from "react";

function wait(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export const TextMessage = (props: {
    message: string,
    onUtteranceComplete(): void
}) => {
    const [text, setText] = useState("")

    useEffect(() => {
        const controller = new AbortController()
        const signal = controller.signal
        const func = async () => {
            for (let i = 0; i < props.message.length; i++) {
                if (signal.aborted) return
                setText(props.message.substring(0, i + 1))
                await wait(50)
            }
        }
        func()

        return () => controller.abort()
    }, [])

    useEffect(() => {
        let utterance = new SpeechSynthesisUtterance(props.message);
        // console.log("Speaking with voice:", props.voice)
        // utterance.voice = props.voice;

        let startTimeout = setTimeout(() => {
            // Ensures the quote reading continues, even if speech synthesis does not occur
            window.speechSynthesis.speak(utterance);
            // window.speechSynthesis.cancel();
            // if (props.onNextMessage) props.onNextMessage();
        }, 100)

        utterance.onstart = () => clearTimeout(startTimeout)
        utterance.onend = () => {
            console.log("Finished speaking", utterance)

            setTimeout(() => {
                props.onUtteranceComplete()
            }, 5000)

        }
        utterance.onerror = (e) => {
            console.log("Error while speaking", e)
            // props.onUtteranceComplete()
        }

        return () => {
            clearTimeout(startTimeout)
        }
    }, [])

    return <div className="text-message-container">
        <div className="text-message">{text}</div>
    </div>
}
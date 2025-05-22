"use client"
import {TextMessage} from "../../../../web/components/Message";
import {useCallback, useEffect, useState} from "react";

const TEST_MESSAGES = [
    "This is a test",
    "You smell like a rat",
    "Isn't that a city in greece?",
    "I'm not sure what you're talking about",
    "Dancing like nobody's watching",
    "Why did the chicken cross the metaverse?",
    "Eating pizza upside down in Australia",
    "My cat thinks she's a software developer",
    "High-fiving a cactus wasn't my best idea",
    "The moon is made of recycled memes",
    "Time flies like an arrow, fruit flies like banana",
    "Error 404: Sense of direction not found",
    "Instructions unclear, became a unicorn instead",
    "My code compiled on the first try (just kidding)",
    "do you get pissy when someone chops your sugarcane when its at 2?",
    "I'm gonna fuck this guy so hard it becomes a police report",
    "I will not fuck you go away",
    "I desire your fat log",
    "You have the awareness of a brick wall",
    "I'm not a robot, I'm a human",
    "Why is the coffee machine speaking Latin?",
    "My laptop thinks it's a toaster now",
    "That's what she said... to the AI",
    "Plot twist: The butler was a penguin",
    "Loading personality... please wait...",
    "I speak fluent sarcasm and emoji",
    "The plot chickens... I mean thickens",
    "Did you try turning the universe off and on again?",
    "My brain has too many tabs open",
    "I put the 'pro' in procrastination",
    "Accidentally sent my cat to space again",
    "Warning: May contain traces of wisdom",
    "I'm not lazy, I'm energy efficient",
    "Reality is just a suggestion",
    "My spirit animal is a caffeinated sloth",
    "Professional nap taker and snack enthusiast",
    "Loading witty comment... Error 404",
    "I'm not short, I'm fun-sized",
    "Living life in airplane mode",
    "My bed is a time machine to tomorrow",
    "I'm on a seafood diet - I see food, I eat it",
    "Relationship status: Made dinner for two... ate both",
    "I don't need Google, my wife knows everything",
    "I'm not arguing, I'm explaining why I'm right",
    "My passwords are like my jokes - nobody gets them",
    "I speak fluent movie quotes",
    "I put the 'mess' in messenger",
    "My room is not messy, it's organized chaos",
    "I'm not clumsy, the floor just hates me",
    "I'm not addicted to coffee, we're just in a relationship",
    "I don't need a hairdresser, I need a miracle",
    "I'm not late, everyone else is just early",
    "My dinner is whatever I don't have to spell to order",
    "I'm not weird, I'm limited edition",
    "I don't need a GPS, I enjoy getting lost",
    "My superpower is making people laugh... accidentally",
    "I speak three languages: English, Sarcasm, and GIF",
    "Error 404: Motivation not found",
    "I'm not a morning person, I'm a coffee person",
    "My diet starts tomorrow... said yesterday",
    "Professional procrastinator with years of experience",
    "I'm not short, I'm concentrated awesome",
    "Living life one coffee at a time",
    "I don't need therapy, I just need more RAM",
    "I'm not a photogenic person, I'm a meme person",
    "My life is like a browser - 100 tabs open",
    "I put the 'fun' in dysfunctional",
    "I'm not lazy, I'm in energy-saving mode",
    "Warning: Contains high levels of awesomeness",
    "I'm not random, I'm just... squirrel!",

]

export default function QuotesGame() {
    const [messages, setMessages] = useState<[string, string][]>([])

    const addMessage = useCallback(() => {
        setMessages((m) => {
            let new_messages = [...m]
            new_messages.push([crypto.randomUUID(), TEST_MESSAGES[Math.floor(Math.random() * TEST_MESSAGES.length)]])
            return new_messages.slice(-10)
        })
    }, [])

    useEffect(() => {
        setMessages([["abc", "Hello, world!"]])
    }, [])

    return <div style={{
        width: "100vw",
        height: "100vh",
        backgroundImage: "url(/images/QuotesGameCoverArt.svg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
    }}>
        <div style={{
            position: "absolute",
            bottom: "20px",
            left: "20px",
        }}>
            {messages.map(message =>
                <TextMessage message={message[1]} onUtteranceComplete={addMessage} key={message[0]}/>
            )}
        </div>
        <div className="controls-panel">
            Who said the <u><strong>WHITE</strong></u>?
        </div>
    </div>
}
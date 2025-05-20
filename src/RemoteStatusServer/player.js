export class Player {
    constructor(data, parent) {
        this.lastAchievementID = "";
        this.id = data.id;
        this.username = data.username;
        this.parent = parent;
        this._data = data;
        this.updatePlayerInfo(data);
    }
    get voiceConnectionGroup() {
        return this._data.voiceConnectionGroup;
    }
    updatePlayerInfo(data) {
        this._data = data;
        this.parent.emit("playerDataUpdate", this);
    }
    get isTyping() {
        return !!this._typing_message;
    }
    get isTypingMessage() {
        return this._typing_message;
    }
    get position() {
        return this._data.position;
    }
    get dimension() {
        return this._data.dimension;
    }
    get experience() {
        return this._data.experience;
    }
    sendMessage(message) {
        return this.parent.broadcastMessage(message, [this]);
    }
    setTyping(message) {
        this._typing_message = message;
        if (this._typing_timeout)
            clearTimeout(this._typing_timeout);
        if (message)
            this._typing_timeout = setTimeout(() => {
                this._typing_message = null;
            }, 30000);
    }
}

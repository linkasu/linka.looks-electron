import { storageService } from "@/CardsStorage/frontend";
import { Card } from "@/interfaces/ConfigFile";


export class TTS {

    isPlaying = false;
    audio = new Audio()
    private static _instance: TTS
    static get instance(): TTS {
        if (TTS._instance == null) {
            TTS._instance = new TTS;
        }
        return TTS._instance
    }

    public async playCards(file: string, cards: Card[]) {
        if (this.isPlaying) {
            this.isPlaying = false;
            this.audio.pause()
            return
        }
        this.isPlaying = true
        for (const card of cards) {
            if (!this.isPlaying) break;
            if (card.cardType == 0) {

                const buffer = await storageService.getAudio(file, card.audioPath)
                if (!buffer) continue;
                const url = URL.createObjectURL(
                    new Blob([buffer], { type: "audio/wav" } /* (1) */)
                );
                await this.playUrl(url);
            }
        }
        this.isPlaying = false
    }
    public playText(text: string): Promise<void> {

        return new Promise((resolve, reject) => {
            text = text.trim();
            if (text.length == 0) {
                resolve();
                return
            }
            if (this.isPlaying) {
                this.isPlaying = false;
                window.speechSynthesis.cancel();
                return resolve();
            }
            this.isPlaying = true;
            const speech = new SpeechSynthesisUtterance();
            speech.text = text;
            window.speechSynthesis.speak(speech);
            speech.onend = () => {
                this.isPlaying = false;
                resolve();
            };
            speech.onerror = (event) => {
                this.isPlaying = false;
                reject(event.error);
            };
        });
    }


    private playUrl(url: string) {
        return new Promise((resolve, reject) => {

            this.audio.src = url;
            this.audio.oncanplay = async () => {
                await this.audio.play();
            }
            this.audio.onended = resolve

        });

    }
}
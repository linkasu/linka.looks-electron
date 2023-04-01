import axios from "axios";


export async function tts(text: string, voice: string): Promise<Buffer> {

    const response = await axios.post('https://tts.linka.su/tts', { text, voice }, { responseType: 'arraybuffer' });

    return response.data;
}

import childProcess from 'child_process';
import fs from 'fs';
import * as googleTTS from 'google-tts-api';
import path from 'path';
import * as tools from './tools';

/**
 * Test function, text to speech gsm
 *
 * @param text text which will be converted
 * @param filename filenmae of gsm file
 * @returns base64 string of gsm file
 */
export async function test(text: string, filename: string): Promise<string> {
    try {
        const converter = new TextToGSMConverter({ transcoder: 'ffmpeg', language: 'de' });
        const base64 = converter.textToGsm(text, `${filename}.gsm`, 100);
        return base64;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
        // error
    }
    return '';
}

/**
 * Text to MP3 converter. A lot of the logik is from the ioBroker.sayit adapter.
 * MP3 to GSM transcoder. The shell program ffmpeg is needed
 *
 */
export class TextToGSMConverter {
    private options: { transcoder: string; language: string };

    /**
     * Constructor
     *
     * @param options options
     * @param options.transcoder ffmpeg or sox
     * @param options.language language like de or en
     */
    constructor(options: { transcoder: string; language: string }) {
        this.options = options;
    }

    /**
     * Get Transcoder
     *
     * @returns transcoder like sox or ffmpeg
     */
    private getTranscoder(): string {
        return this.options.transcoder;
    }

    /**
     * Get Language
     *
     * @returns language like en or de
     */
    private getLanguage(): string {
        return this.options.language;
    }

    /**
     * Convert filename with ending gsm to endning mp3
     *
     * @param fileNameGSM filename with gsm ending
     * @returns filenameMP3
     */
    public getMp3FromGSMfilename(fileNameGSM: string): string {
        return fileNameGSM.replace(/.gsm$/i, '.mp3');
    }

    /**
     * Convert filename with ending mp3 to endning gsm
     *
     * @param fileNameMP3 filename with gsm ending
     * @returns filenameGSM
     */
    public getGSMFromMp3filename(fileNameMP3: string): string {
        return fileNameMP3.replace(/.mp3$/i, '.gsm');
    }

    /**
     * delete file from drive
     *
     * @param filename filename
     * @returns true if deleted
     */
    public rmfile(filename: string): boolean {
        if (fs.existsSync(filename)) {
            fs.unlinkSync(filename);
        }
        if (fs.existsSync(filename)) {
            return false;
        }
        return true;
    }

    /**
     * converts text to mp3 (speech) and saves it to a file
     *
     * @param text text which will be converted to speech
     * @param fileNameMP3 mp3 filenme inkl. path
     * @param volume not used
     * @returns speech as base64 string
     */
    public async textToMp3(text: string, fileNameMP3: string, volume?: number): Promise<string> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const vol = volume;
        const rets = await googleTTS.getAllAudioBase64(text, {
            lang: this.options.language.toLowerCase(),
            slow: false,
        });
        let base64 = '';
        for (const ret of rets) {
            base64 += ret.base64;
        }
        const buffer = Buffer.from(base64, 'base64');
        this.rmfile(fileNameMP3);
        fs.writeFileSync(fileNameMP3, buffer, { encoding: 'base64' });
        return base64;
    }

    /**
     * converts text to gsm (speech) and saves it to a file
     *
     * @param text text which will be converted to speech
     * @param fileNameGSM gsm filenme inkl. path
     * @param volume not used
     * @returns speech as base64 string
     */
    public async textToGsm(text: string, fileNameGSM: string, volume?: number): Promise<string> {
        const fileNameMP3 = `${path.dirname(fileNameGSM)}/${tools.getGuid()}.mp3`;
        switch (this.options.transcoder) {
            case 'ffmpeg': {
                await this.textToMp3(text, fileNameMP3, volume);
                const base64 = await this.mp3ToGsmFfmpeg(fileNameMP3, fileNameGSM);
                fs.unlinkSync(fileNameMP3);
                return base64;
            }
            case 'sox': {
                await this.textToMp3(text, fileNameMP3, volume);
                const base64 = await this.mp3ToGsmSox(fileNameMP3, fileNameGSM);
                fs.unlinkSync(fileNameMP3);
                return base64;
            }
            default:
                throw new Error(`Transcoder has to be sox or ffmpeg and not ${this.options.transcoder}`);
        }
    }

    /**
     * converts mp3 to gsm (speech) and saves it to a file
     *
     * @param fileNameMP3 mp3 filenme inkl. path
     * @param fileNameGSM gsm filenme inkl. path
     * @param volume not used
     * @returns speech as base64 string
     */
    public async mp3ToGsm(fileNameMP3: string, fileNameGSM: string, volume?: number): Promise<string> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const vol = volume;
        switch (this.options.transcoder) {
            case 'ffmpeg':
                return await this.mp3ToGsmFfmpeg(fileNameMP3, fileNameGSM);
            case 'sox':
                return await this.mp3ToGsmSox(fileNameMP3, fileNameGSM);
            default:
                throw new Error(`Transcoder has to be sox or ffmpeg and not ${this.options.transcoder}`);
        }
    }

    private async mp3ToGsmFfmpeg(fileNameMP3: string, fileNameGSM: string): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(fileNameMP3)) {
                reject(new Error(`File ${fileNameMP3} does not exists!`));
            }
            this.rmfile(fileNameGSM);
            const ffmpeg = childProcess.spawn('ffmpeg', [
                '-i',
                fileNameMP3,
                '-loglevel',
                'error',
                '-c:a',
                'libgsm',
                '-ar',
                '8000',
                '-ab',
                '13000',
                '-ac',
                '1',
                '-f',
                'gsm',
                '-y',
                fileNameGSM,
            ]);
            ffmpeg.on('exit', (code: number) => {
                if (code === 0) {
                    const base64 = fs.readFileSync(fileNameGSM, { encoding: 'base64' });
                    if (fs.existsSync(fileNameGSM)) {
                        resolve(base64);
                    } else {
                        reject(new Error(`Error, file ${fileNameGSM} does not exists!`));
                    }
                } else {
                    reject(new Error(`Error transcoding file from MP3 to GSM`));
                }
            });
            ffmpeg.on('error', (err: { message: any }) =>
                reject(new Error(`Error transcoding file from MP3 to GSM, ${err.message}`)),
            );
        });
    }

    private async mp3ToGsmSox(fileNameMP3: string, fileNameGSM: string): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(fileNameMP3)) {
                reject(new Error(`File ${fileNameMP3} does not exists!`));
            }
            this.rmfile(fileNameGSM);
            const sox = childProcess.spawn('sox', [fileNameMP3, '-r', '8000', '-c', '1', fileNameGSM]);
            sox.on('exit', code => {
                if (code === 0) {
                    const base64 = fs.readFileSync(fileNameGSM, { encoding: 'base64' });
                    if (fs.existsSync(fileNameGSM)) {
                        resolve(base64);
                    } else {
                        reject(Error(`Error, file ${fileNameGSM} does not exists!`));
                    }
                } else {
                    reject(Error(`Error transcoding file from MP3 to GSM`));
                }
            });
            sox.on('error', err => reject(new Error(`Error transcoding file from MP3 to GSM, ${err.message}`)));
        });
    }
}

import axios from 'axios';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NodeSSH, Config as NodeSSHConfig } from 'node-ssh';

export type sshconfig = NodeSSHConfig;

/**
 * Sleep
 *
 * @param seconds sleep time
 * @returns void
 */
export function wait(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Substr
 *
 * @param text test
 * @param start from
 * @param length length
 * @returns substring
 */
export function substr(text: string, start: number, length?: number): string {
    length = length === undefined || length > text.length ? text.length : length;
    const retstr = text.substring(start, start + length);
    return retstr;
}

/**
 *
 * @returns guid
 */
export function getGuid(): string {
    function _p8(s: boolean): any {
        const p = substr(`${Math.random().toString(16)}000000000`, 2, 8);
        return s ? `-${substr(p, 0, 4)}-${substr(p, 4, 4)}` : p;
    }

    return `${_p8(false)}${_p8(true)}${_p8(true)}${_p8(false)}`;
}

/**
 *
 * @param text text mit nummer
 * @returns nummer
 */
export function textToNumber(text: string): string {
    let numb: any = '';
    if (text) {
        numb = text.match(/[\d*#]/g);
        numb = numb.join('');
    }
    return numb;
}

/**
 * Tests whether the given variable is a real object and not an Array
 *
 * @param it The variable to test
 * @returns if an object
 */
export function isObject(it: any): boolean {
    // This is necessary because:
    // typeof null === 'object'
    // typeof [] === 'object'
    // [] instanceof Object === true
    return Object.prototype.toString.call(it) === '[object Object]';
}

/**
 * Tests whether the given variable is really an Array
 *
 * @param it The variable to test
 */
export function isArray(it: any): boolean {
    if (Array.isArray != null) {
        return Array.isArray(it);
    }
    return Object.prototype.toString.call(it) === '[object Array]';
}

/**
 * Translates text using the Google Translate API
 *
 * @param text The text to translate
 * @param targetLang The target languate
 * @returns string
 */
export async function _translateText(text: string, targetLang: string): Promise<string> {
    if (targetLang === 'en') {
        return text;
    }
    try {
        const url = `http://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}&ie=UTF-8&oe=UTF-8`;
        const response = await axios({ url, timeout: 5000 });
        if (isArray(response.data)) {
            // we got a valid response
            return response.data[0][0][0];
        }
        throw new Error('Invalid response for translate request');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
        throw new Error(`Could not translate to "${targetLang}"`);
    }
}

/**
 * Checks OS
 *
 * @returns true if Windows
 */
export function isWindow(): boolean {
    return process.platform.startsWith('win');
}

/**
 * Adds / to pathname
 *
 * @param path pathname
 * @returns pathname with ending /
 */
export function addSlashToPath(path: string): string {
    if (isWindow() && path?.slice(-1) != '\\') {
        return `${path}\\`;
    }
    if (!isWindow() && path?.slice(-1) != '/') {
        return `${path}/`;
    }
    return path;
}

/**
 * Get basename of filename
 *
 * @param filename with ending like test.gsm
 * @returns filename without ending like test
 */
export function getFilenameWithoutExtension(filename: string): string {
    return filename.split('.').slice(0, -1).join('.') || filename;
}

/**
 * SSH copy file
 *
 * @param srcfile source file
 * @param dstfile destination file
 * @param config configuration file for SSH
 */
export async function sendSSH(srcfile: string, dstfile: string, config: sshconfig): Promise<void> {
    const ssh = new NodeSSH();
    await ssh.connect(config);
    await ssh.putFile(srcfile, dstfile);
}

/**
 * SSH excecute command
 *
 * @param command comand
 * @param config configuration file for SSH
 * @param options option
 */
export async function executedSSH(command: string, config: sshconfig, options?: any): Promise<void> {
    const ssh = new NodeSSH();
    await ssh.connect(config);
    const result = await ssh.execCommand(command, options);
    if (result.stderr) {
        throw new Error(result.stderr);
    }
}

/**
 * SSH excecute command
 *
 * @param path path to create
 * @param config configuration file for SSH
 */
export async function mkdirdSSH(path: string, config: sshconfig): Promise<void> {
    const ssh = new NodeSSH();
    await ssh.connect(config);
    const command: string = isWindow() ? `mkdir ${path}` : `mkdir -p ${path}`;
    const result = await ssh.execCommand(command);
    if (result.stderr) {
        throw new Error(result.stderr);
    }
}

/**
 * Errormessage
 *
 * @param error error
 * @returns error as message
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

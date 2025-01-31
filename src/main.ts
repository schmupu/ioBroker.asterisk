/*
 * Created with @iobroker/create-adapter v2.5.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import * as fs from 'fs';
import path from 'node:path';
import { AsteriskManager } from './lib/ami';
import * as tools from './lib/tools';
import { TextToGSMConverter } from './lib/transcode';

interface audiotextparamater {
    text?: string;
    audiofile?: string;
    language?: string;
}

interface dialparameter {
    callerid: string;
    telnr: string;
    text?: string;
    audiofile?: string;
    language?: string;
    delete?: string;
    extension?: string;
}

class asterisk extends utils.Adapter {
    private onlineCheckAvailable: boolean;
    private onlineCheckTimeout: ReturnType<typeof this.setTimeout>;
    private sshconfig: tools.sshconfig;
    private configfiles: string[];
    private asterisk: AsteriskManager | undefined;
    private tmppath: string;
    private timeouthandler: ioBroker.Timeout | undefined;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'asterisk',
        });
        this.configfiles = [
            'pjsip_telekom.conf.template',
            'pjsip_fritzbox.conf.template',
            'pjsip_sipgate.conf.template',
            'sip_fritzbox.conf.template',
            'extensions.ael.template',
            'manager.conf.template',
            'rtp.conf.template',
        ];
        this.tmppath = tools.isWindow() ? tools.addSlashToPath('c:\\temp\\') : tools.addSlashToPath('/tmp/');
        this.onlineCheckAvailable = false;
        this.onlineCheckTimeout = undefined;
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        // await tools.wait(10);
        await this.setState('info.connection', { val: true, ack: true });
        this.subscribeStates('*');
        this.log.info(
            `Starting Adapter ${this.namespace} in version ${this.version} with transcoder ${
                this.config.transcoder
            } and language ${this.config.language}`,
        );
        this.sshconfig = {
            host: this.config.ip,
            username: this.config.sshuser,
            port: this.config.sshport,
            password: this.config.sshpassword,
            tryKeyboard: true,
            onKeyboardInteractive: (
                name: any,
                instructions: any,
                instructionsLang: any,
                prompts: string | any[],
                finish: (arg0: any[]) => void,
            ) => {
                if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
                    finish([this.config.sshpassword]);
                }
            },
        };
        try {
            await this.createPath(this.config.path);
            await this.createConfigFiles();
            await this.initStates();
            await this.startAsterisk();
        } catch (err) {
            this.log.error(`Error: ${tools.getErrorMessage(err)}`);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback calback function
     */
    private async onUnload(callback: () => void): Promise<void> {
        try {
            this.log.info(`Stopping asterisk processes, please wait!`);
            await this.asteriskDisconnect();
            await this.setState('info.connection', { val: false, ack: true });
            callback();
        } catch (err) {
            this.log.error(`Error: ${tools.getErrorMessage(err)}`);
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     *
     * @param id id of the object
     * @param obj object
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private async onObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
        // const asterisk = await Lupus.getInstance(this);
        // await asterisk.onObjectChange(id, obj);
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id id of state
     * @param state state
     */
    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (state && !state.ack) {
            const stateId = id.replace(`${this.namespace}.`, '');
            this.log.debug(`Call of onStateChange for ${stateId}: ${JSON.stringify(state)}`);
            if (stateId === 'dialin.create') {
                const text = (await this.getStateAsync('dialin.text'))?.val?.toString() || '';
                const language = (await this.getStateAsync('dialin.language'))?.val?.toString() || this.config.language;
                try {
                    await this.createDialInFile({ text: text, language: language });
                    await this.setStateChangedAsync('dialin.create', { ack: true });
                    await this.setStateChangedAsync('dialin.text', { ack: true });
                    await this.setStateChangedAsync('dialin.language', { ack: true });
                } catch (err) {
                    this.log.error(`Error in onStateChange: ${stateId}:  ${tools.getErrorMessage(err)}`);
                }
            }
            if (stateId === 'dialout.call') {
                const parameter: dialparameter = {
                    callerid: (await this.getStateAsync('dialout.callerid'))?.val?.toString() || '',
                    text: (await this.getStateAsync('dialout.text'))?.val?.toString() || '',
                    telnr: (await this.getStateAsync('dialout.telnr'))?.val?.toString() || '',
                    language: (await this.getStateAsync('dialout.language'))?.val?.toString() || this.config.language,
                };
                try {
                    await this.asteriskConnect();
                    await this.asteriskDial(parameter);
                    await this.setStateChangedAsync('dialout.call', { ack: true });
                    await this.setStateChangedAsync('dialout.callerid', { ack: true });
                    await this.setStateChangedAsync('dialout.telnr', { ack: true });
                    await this.setStateChangedAsync('dialout.text', { ack: true });
                    await this.setStateChangedAsync('dialout.language', { ack: true });
                } catch (err) {
                    this.log.error(`Error in onStateChange: ${stateId}:  ${tools.getErrorMessage(err)}`);
                }
            }
        }
    }

    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.messagebox" property to be set to true in io-package.json
     *
     * @param obj object
     */
    private async onMessage(obj: ioBroker.Message): Promise<void> {
        if (typeof obj === 'object' && obj.message) {
            switch (obj.command) {
                case 'dial': {
                    const parameter: dialparameter = obj.message;
                    try {
                        await this.asteriskConnect();
                        const result = await this.asteriskDial(parameter);
                        /*
                        await this.setState('dialout.telnr', { val: parameter?.telnr || '', ack: true });
                        await this.setState('dialout.text', { val: parameter?.text || '', ack: true });
                        await this.setState('dialout.callerid', { val: parameter?.callerid || '', ack: true });
                        */
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, { result: result, error: undefined }, obj.callback);
                        }
                    } catch (err) {
                        this.sendTo(
                            obj.from,
                            obj.command,
                            { result: undefined, error: tools.getErrorMessage(err) },
                            obj.callback,
                        );
                        this.log.error(`Error in onMessage for cammnd ${obj.command}: ${tools.getErrorMessage(err)}`);
                    }
                    break;
                }
                case 'action': {
                    const parameter: any = obj.message?.parameter;
                    const atoptions: audiotextparamater = obj.message?.at;
                    try {
                        await this.asteriskConnect();
                        const result = await this.asteriskAction(parameter, atoptions);
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, { result: result, error: undefined }, obj.callback);
                        }
                    } catch (err) {
                        this.sendTo(
                            obj.from,
                            obj.command,
                            { result: undefined, error: tools.getErrorMessage(err) },
                            obj.callback,
                        );
                        this.log.error(`Error in onMessage for cammnd ${obj.command}: ${tools.getErrorMessage(err)}`);
                    }
                    break;
                }
                case 'dialin': {
                    const atoptions: audiotextparamater = obj.message;
                    try {
                        const language = atoptions?.language ? atoptions?.language : this.config.language;
                        const text = atoptions.text;
                        const audiofile = atoptions.audiofile;
                        await this.createDialInFile({ text: text, audiofile: audiofile, language: language });
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, { result: true, error: undefined }, obj.callback);
                        }
                    } catch (err) {
                        this.sendTo(
                            obj.from,
                            obj.command,
                            { result: false, error: tools.getErrorMessage(err) },
                            obj.callback,
                        );
                        this.log.error(`Error in onMessage for cammnd ${obj.command}: ${tools.getErrorMessage(err)}`);
                    }
                    break;
                }
                default:
                    this.log.error(`Unknown comannd ${obj.command} in onMessage`);
                    break;
            }
        }
    }

    /**
     * Init States
     */
    private async initStates(): Promise<void> {
        this.log.debug(`Init default States`);
        const dialin_text =
            (await this.getStateAsync('dialin.text'))?.val?.toString() ||
            'Please enter after the beep tone your passwort and press hashtag.';
        const dialout_text =
            (await this.getStateAsync('dialout.text'))?.val?.toString() ||
            'Please enter after the beep tone your passwort and press hashtag.';
        const dialin_language = (await this.getStateAsync('dialin.language'))?.val?.toString() || this.config.language;
        const dialout_language =
            (await this.getStateAsync('dialout.language'))?.val?.toString() || this.config.language;
        await this.setStateChangedAsync('dialout.language', { val: dialout_language, ack: true });
        await this.setStateChangedAsync('dialin.language', { val: dialin_language, ack: true });
        await this.setStateChangedAsync('dialout.text', { val: dialout_text, ack: true });
        await this.setStateChangedAsync('dialin.text', { val: dialin_text, ack: true });
        await this.createDialInFile({ text: dialin_text, language: dialin_language });
    }

    /**
     * create a gsm audiofile in tmp path from text or other audiofile in gsm or mp3 mode
     *
     * @param atoptions options like text, audio and language
     * @param atoptions.text text (optional)
     * @param atoptions.audiofile aufdiofile in gsm or mp3 format (optional)
     * @param atoptions.language language (optional)
     * @returns the filename of the gsm file
     */
    private async getGuidGsmFile(atoptions: audiotextparamater): Promise<string> {
        this.log.debug(`Starting getGuidGsmFile`);
        const tmppath = this.tmppath;
        const guid = tools.getGuid();
        const audiofile_guid_gsm = `${tmppath}audio_${guid}.gsm`;
        const language = atoptions.language ? atoptions.language : this.config.language;
        if (!atoptions.audiofile && !atoptions.text) {
            throw new Error(`Text or audiofile are missing!`);
        }
        if (atoptions.audiofile && atoptions.text) {
            throw new Error(`Text or audiofile, but not both!`);
        }
        const converter = new TextToGSMConverter({
            transcoder: this.config.transcoder,
            language: language,
        });
        if (atoptions.text) {
            await converter.textToGsm(atoptions.text, audiofile_guid_gsm);
        }
        if (atoptions.audiofile) {
            switch (path.extname(atoptions.audiofile).toLowerCase()) {
                case '.mp3':
                    await converter.mp3ToGsm(atoptions.audiofile, audiofile_guid_gsm);
                    break;
                case '.gsm':
                    fs.copyFileSync(atoptions.audiofile, audiofile_guid_gsm);
                    break;
                default:
                    throw new Error(`Audiofile ${atoptions.audiofile} must have ending .mp3 or .gsm`);
            }
        }
        if (!fs.existsSync(audiofile_guid_gsm)) {
            throw new Error(`Could not find the file ${audiofile_guid_gsm}`);
        }
        return audiofile_guid_gsm;
    }

    /**
     * Create path
     *
     * @param path path to create
     */
    private async createPath(path: string): Promise<void> {
        if (this.config.ssh) {
            this.log.info(`Creating path ${path} on ${this.config.sshuser}@${this.config.ip} if not exist!`);
            await tools.mkdirdSSH(path, this.sshconfig);
        } else {
            if (!fs.existsSync(path)) {
                this.log.info(`Creating path ${path}!`);
                fs.mkdirSync(path, { recursive: true });
            }
        }
    }

    /**
     * Create Config Files
     *
     * @returns void
     */
    private async createConfigFiles(): Promise<void> {
        this.log.debug(`Starting createConfigFiles`);
        if (!this.config.forceReInit) {
            return;
        }
        const config: any = this.config;
        config.sipusercountry = `+49${config.sipuser.slice(1)}`;
        try {
            for (const file of this.configfiles) {
                if (!file.startsWith(this.config.service) && file.match(/^(sip|pjsip)/)) {
                    continue;
                }
                const tmppath = this.tmppath;
                const srcfile = tools.isWindow()
                    ? `${this.adapterDir}\\template\\${file}`
                    : `${this.adapterDir}/template/${file}`;
                const dstfile = `${tmppath}${file.replace('.template', '')}`;
                this.log.debug(`Read file ${srcfile}`);
                let dstcontent = fs.readFileSync(srcfile, { encoding: 'utf8' });
                for (const i in config) {
                    const search = `\${${i}}`;
                    const value = config[i];
                    dstcontent = dstcontent.split(search).join(value);
                }
                this.log.debug(`Write config file ${dstfile}`);
                fs.writeFileSync(dstfile, dstcontent, { encoding: 'utf8' });
                if (this.config.ssh) {
                    this.log.info(
                        `Transfering Config File: scp ${dstfile} ${this.config.sshuser}@${this.config.ip}:${dstfile}`,
                    );
                    await tools.sendSSH(dstfile, dstfile, this.sshconfig);
                    this.log.info(
                        `Create config file ${dstfile} on server ${this.config.ip} for asterisk. Please rename it and move it to /etc/asterisk/`,
                    );
                    this.log.debug(`Delete file ${dstfile}`);
                    fs.unlinkSync(dstfile);
                } else {
                    this.log.info(
                        `Create config file ${dstfile} for asterisk. Please rename it and  move it to /etc/asterisk/`,
                    );
                }
            }
            await this.extendForeignObject(`system.adapter.${this.namespace}`, { native: { forceReInit: false } });
        } catch (err) {
            this.log.error(`Error, could not create configfile. ${tools.getErrorMessage(err)}`);
        }
    }

    /**
     * Asterisk action
     *
     * @param parameter AMI Paramter
     * @param atoptions text or audiofile (optional)
     * @param atoptions.text text (optional)
     * @param atoptions.audiofile audiofile (optional)
     * @param atoptions.language language (optional)
     * @returns result
     */
    private async asteriskAction(parameter: any, atoptions?: audiotextparamater): Promise<any> {
        this.log.debug(`Starting asteriskAction`);
        if (!this.asterisk?.isConnected()) {
            throw new Error(`No connection to Asterisk!`);
        }
        const audiofile_guid_gsm = await this.getGuidGsmFile({
            text: atoptions?.text,
            audiofile: atoptions?.audiofile,
            language: atoptions?.language,
        });
        if (this.config.ssh) {
            const audiofile_ssh_gsm = tools.addSlashToPath(this.config.path) + path.basename(audiofile_guid_gsm);
            this.log.debug(`scp ${audiofile_guid_gsm} ${this.config.sshuser}@${this.config.ip}:${audiofile_ssh_gsm}`);
            await tools.sendSSH(audiofile_guid_gsm, audiofile_ssh_gsm, this.sshconfig);
            this.log.debug(`Delete file ${audiofile_guid_gsm}`);
            fs.unlinkSync(audiofile_guid_gsm);
            if (parameter.variable) {
                parameter.variable.file = tools.getFilenameWithoutExtension(audiofile_ssh_gsm);
                parameter.variable.del = 'delete';
            } else {
                parameter.variable = {
                    file: tools.getFilenameWithoutExtension(audiofile_ssh_gsm),
                    del: 'delete',
                };
            }
        }
        if (!this.config.ssh) {
            const audiofile_local_gsm = tools.addSlashToPath(this.config.path) + path.basename(audiofile_guid_gsm);
            this.log.debug(`move ${audiofile_guid_gsm} ${audiofile_local_gsm}`);
            fs.renameSync(audiofile_guid_gsm, audiofile_local_gsm);
            if (parameter.variable) {
                parameter.variable.file = tools.getFilenameWithoutExtension(audiofile_local_gsm);
                parameter.variable.del = 'delete';
            } else {
                parameter.variable = {
                    file: tools.getFilenameWithoutExtension(audiofile_local_gsm),
                    del: 'delete',
                };
            }
        }
        this.log.debug(`Message: ${JSON.stringify(parameter)}`);
        this.log.debug('AMI Command');
        const result = await this.asterisk.actionAsync(parameter);
        this.log.debug(`AMI Result : ${JSON.stringify(result)}`);
        return result;
    }

    /**
     * Asterisk Dial
     *
     * @param parameter parameter
     */
    private async asteriskDial(parameter: dialparameter): Promise<any> {
        this.log.debug(`Starting asteriskDial`);
        if (!this.asterisk?.isConnected()) {
            throw new Error(`No connection to Asterisk!`);
        }
        const audiofile_guid_gsm = await this.getGuidGsmFile({
            text: parameter?.text,
            audiofile: parameter?.audiofile,
            language: parameter?.language,
        });
        parameter.language = parameter.language ? parameter.language : this.config.language;
        parameter.extension = parameter.extension ? parameter.extension : this.config.sipuser;
        if (this.config.ssh) {
            const audiofile_ssh_gsm = tools.addSlashToPath(this.config.path) + path.basename(audiofile_guid_gsm);
            this.log.debug(`scp ${audiofile_guid_gsm} ${this.config.sshuser}@${this.config.ip}:${audiofile_ssh_gsm}`);
            await tools.sendSSH(audiofile_guid_gsm, audiofile_ssh_gsm, this.sshconfig);
            this.log.debug(`Delete file ${audiofile_guid_gsm}`);
            fs.unlinkSync(audiofile_guid_gsm);
            parameter.audiofile = tools.getFilenameWithoutExtension(audiofile_ssh_gsm);
            parameter.delete = 'delete';
        }
        if (!this.config.ssh) {
            const audiofile_local_gsm = tools.addSlashToPath(this.config.path) + path.basename(audiofile_guid_gsm);
            this.log.debug(`move ${audiofile_guid_gsm} ${audiofile_local_gsm}`);
            fs.renameSync(audiofile_guid_gsm, audiofile_local_gsm);
            parameter.audiofile = tools.getFilenameWithoutExtension(audiofile_local_gsm);
            parameter.delete = 'delete';
        }
        this.log.debug(`Message: ${JSON.stringify(parameter)}`);
        this.log.debug('AMI Command');
        const result = await this.asterisk.dialAsync(parameter);
        this.log.debug(`AMI Result : ${JSON.stringify(result)}`);
        return result;
    }

    /**
     * start Astersisk
     */
    private async startAsterisk(): Promise<void> {
        try {
            const start = await this.asteriskConnect();
            if (start) {
                await this.asteriskAnswerCall();
            }
        } catch (err) {
            this.log.error(`Error: ${tools.getErrorMessage(err)}`);
        }
        this.timeouthandler = this.setTimeout(async () => {
            await this.startAsterisk();
        }, 10 * 1000);
    }

    /**
     * Connect to Asterisk AMI
     */
    private async asteriskConnect(): Promise<boolean> {
        let start = false;
        if (!this.asterisk) {
            this.log.debug(`Connect to Asterisk`);
            this.asterisk = new AsteriskManager({
                port: this.config.port,
                hostname: this.config.ip,
                username: this.config.user,
                password: this.config.password,
                service: this.config.service,
            });
            start = true;
        } else {
            this.log.debug(`Reconnect to Asterisk`);
            try {
                await this.asterisk.reconnectAsync();
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (err) {
                this.log.debug(`Reconnect to Asterisk was not succesfull. Restarting Aseterisk`);
                try {
                    await this.asteriskDisconnect();
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (err) {
                    /* empty */
                }
                this.asterisk = new AsteriskManager({
                    port: this.config.port,
                    hostname: this.config.ip,
                    username: this.config.user,
                    password: this.config.password,
                    service: this.config.service,
                });
                start = true;
            }
        }
        let count = 0;
        while (!this.asterisk.isConnected()) {
            count++;
            if (count > 1000) {
                throw new Error(`Could not connect to Asterisk`);
            }
            await tools.wait(20 / 1000);
        }
        return start;
    }

    /**
     * Disconnect from Asterix AMI
     */
    private async asteriskDisconnect(): Promise<void> {
        if (this.asterisk) {
            this.log.debug(`Disconnecting from Asterisk`);
            if (this.timeouthandler) {
                this.clearTimeout(this.timeouthandler);
            }
            try {
                await this.asterisk.disconnectAsync();
                let count = 0;
                while (this.asterisk.isConnected()) {
                    count++;
                    if (count > 1000) {
                        throw new Error(`Could not disconnect to Asterisk`);
                    }
                    await tools.wait(20 / 1000);
                }
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (err) {
                /* empty */
            }
        }
    }

    /**
     * Answer Asterisk Call
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    private async asteriskAnswerCall(): Promise<void> {
        this.log.debug(`Starting asteriskAnswerCall`);
        const vars: { [key: string]: any } = {};
        this.asterisk?.on('managerevent', async (evt: any) => {
            this.log.debug(`Management Events ${JSON.stringify(evt)}`);
            if (evt.event == 'VarSet' && evt.variable) {
                for (const i in evt.variable) {
                    if (!vars[i] || vars[i].uniqueid != evt.uniqueid || vars[i].value != evt.value) {
                        vars[i] = {
                            uniqueid: evt.uniqueid,
                            value: evt.value,
                        };
                        this.log.debug(`Variable: ${i} = ${evt.value}`);
                        if (evt.context == 'ael-antwort' && i == 'dtmf' && evt.value != '') {
                            await this.setState('dialin.callerid', { val: evt.calleridnum, ack: true });
                            await this.setState('dialin.dtmf', { val: evt.value, ack: true });
                        }
                        if (evt.context == 'ael-ansage' && i == 'dtmf' && evt.value != '') {
                            await this.setState('dialout.dtmf', { val: evt.value, ack: true });
                        }
                    }
                }
            }
        });
    }

    /**
     * Create Dial In File
     *
     * @param atoptions text, audofile and language
     * @param atoptions.text text to convert to a gsm file
     * @param atoptions.audiofile output filename (wiht ending gsm)
     * @param atoptions.language language
     */
    private async createDialInFile(atoptions: audiotextparamater): Promise<void> {
        this.log.debug(`Starting createDialInFile`);
        const audiofile_guid_gsm = await this.getGuidGsmFile(atoptions);
        if (this.config.ssh) {
            const audiofile_dtmf_gsm = `${tools.addSlashToPath(this.config.path)}asterisk_dtmf.gsm`;
            this.log.debug(`scp ${audiofile_guid_gsm} ${this.config.sshuser}@${this.config.ip}:${audiofile_dtmf_gsm}`);
            await tools.sendSSH(audiofile_guid_gsm, audiofile_dtmf_gsm, this.sshconfig);
            this.log.debug(`Delete file ${audiofile_guid_gsm}`);
            fs.unlinkSync(audiofile_guid_gsm);
        }
        if (!this.config.ssh) {
            const audiofile_dtmf_gsm = `${tools.addSlashToPath(this.config.path)}asterisk_dtmf.gsm`;
            this.log.debug(`move ${audiofile_guid_gsm} ${audiofile_dtmf_gsm}`);
            fs.renameSync(audiofile_guid_gsm, audiofile_dtmf_gsm);
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new asterisk(options);
} else {
    // otherwise start the instance directly
    (() => new asterisk())();
}

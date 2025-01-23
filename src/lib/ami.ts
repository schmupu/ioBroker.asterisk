/* eslint-disable jsdoc/require-jsdoc */
import AsteriskManagerGlobal from 'asterisk-manager';
import * as tools from './tools';

/**
 * Interface options
 */
export interface ioptions {
    port: string;
    hostname: string;
    username: string;
    password: string;
    events: boolean;
    service?: string;
}

export interface amaoptions {
    action: string;
    channel: string;
    context: string;
    exten: string;
    priority: string;
    actionid: string;
    timeout: number;
    variable: {
        repeat: number;
        file: string;
        del: string;
    };
    async?: string;
    callerid?: string;
}

/**
 * Asterix Manager Class. More Infos:
 * https://github.com/pipobscure/NodeJS-AsteriskManager
 * https://github.com/mscdex/node-asterisk
 *
 */
export class AsteriskManager {
    ami: any;
    options: ioptions;

    constructor(options: any) {
        this.options = {
            port: options.port,
            hostname: options.hostname,
            username: options.username,
            password: options.password,
            service: options.service || 'sip',
            events: options.events || false,
        };
        this.ami = new AsteriskManagerGlobal(
            this.options.port,
            this.options.hostname,
            this.options.username,
            this.options.password,
            this.options.events,
        );
    }

    /**
     * Get AMI instance
     *
     * @returns AMI insatnce
     */
    public getAmi(): any {
        return this.ami;
    }

    /**
     * Eventhandler for asterisk class
     *
     * @param eventname name of event
     * @param callback callback function
     */
    public on(eventname: string, callback: any): void {
        if (eventname.length > 0 && callback) {
            this.ami.on(eventname, (evt: any) => {
                if (callback) {
                    callback(evt);
                }
            });
        }
    }

    /**
     * Connected to AMI
     *
     * @returns if connected then true else false
     */
    public isConnected(): boolean {
        return this.ami.isConnected();
    }

    /**
     * Connect to AMI
     *
     * @param callback callback
     */
    public connect(callback: any): void {
        this.ami.connect(this.options.port, this.options.hostname, callback);
    }

    /**
     * Connect to AMI async
     *
     * @returns void
     */
    public async connectAsync(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ami.connect(this.options.port, this.options.hostname, () => {
                resolve();
            });
            reject(new Error('Could not connect to asterisk!'));
        });
    }

    /**
     * disconnect from AMI
     *
     * @param callback callback function
     */
    public disconnect(callback: any): void {
        this.ami.disconnect(callback);
    }

    /**
     * disconnect from AMI
     *
     * @returns void
     */
    public async disconnectAsync(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ami.disconnect(() => {
                resolve();
            });
            reject(new Error('Could not disconnect!'));
        });
    }

    /**
     * keep connected to AMI
     */
    public keepConnected(): void {
        this.ami.keepConnected();
    }

    /**
     * login to AMI
     *
     * @param callback callback function
     */
    public login(callback: any): void {
        this.ami.login(callback);
    }

    /**
     * login to AMI async
     *
     * @returns void
     */
    public async loginAsync(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ami.login(() => {
                resolve();
            });
            reject(new Error('Could not login!'));
        });
    }

    /**
     * reconnect to AMI
     *
     * @param callback callback function
     */
    public reconnect(callback: any): void {
        if (!this.isConnected()) {
            this.connect(() => {
                this.login(callback);
            });
        } else {
            if (callback) {
                callback();
            }
        }
    }

    /**
     * reconnect to AMI async
     */
    public async reconnectAsync(): Promise<void> {
        if (!this.isConnected()) {
            await this.connectAsync();
        }
    }

    /**
     * Dial
     *
     * @param parameter dial parameter
     * @param callback callback function
     * @returns the result of the dial
     */
    public dial(parameter: any, callback: any): any {
        if (!parameter) {
            return;
        }
        const telnrs = typeof parameter.telnr === 'string' ? Array(parameter.telnr) : parameter.telnr;
        const extension = parameter.extension || 'none';
        const resultarray: any = [];
        for (const i in telnrs) {
            const telnr = tools.textToNumber(telnrs[i]);
            let channel;
            if (this.options.service === 'pjsip') {
                channel = extension === 'none' ? `PJSIP/${telnr}` : `PJSIP/${telnr}@${extension}`;
            } else {
                channel = extension === 'none' ? `SIP/${telnr}` : `SIP/${extension}/${telnr}`;
            }
            const guid = tools.getGuid();
            const options: amaoptions = {
                action: 'originate',
                channel: channel,
                context: parameter.context || 'ael-ansage',
                exten: parameter.exten || telnr,
                priority: parameter.priority || 1,
                actionid: guid,
                timeout: parameter.timeout || 60 * 1000,
                variable: {
                    repeat: parameter.repeat || 5,
                    file: parameter.audiofile,
                    del: parameter.delete || '',
                },
            };

            if (Object.prototype.hasOwnProperty.call(parameter, 'async')) {
                options.async = parameter.async;
            }
            if (Object.prototype.hasOwnProperty.call(parameter, 'callerid')) {
                options.callerid = tools.textToNumber(parameter.callerid);
            }
            if (Object.prototype.hasOwnProperty.call(parameter, 'variable')) {
                options.variable = parameter.variable;
            }
            this.ami.action(options, (err: any, res: any) => {
                const result = {
                    parameter: parameter,
                    options: options,
                    guid: guid,
                    result: res,
                };
                resultarray.push(result);
                callback && callback(err, result);
            });
        }
        return resultarray;
    }

    /**
     * Dial async
     *
     * @param parameter dial parameter
     * @returns the result of the dial
     */
    public async dialAsync(parameter: any): Promise<any> {
        if (!parameter) {
            return;
        }
        const telnrs = typeof parameter.telnr === 'string' ? Array(parameter.telnr) : parameter.telnr;
        const extension = parameter.extension || 'none';
        const resultarray: any = [];
        for (const i in telnrs) {
            const telnr = tools.textToNumber(telnrs[i]);
            let channel;
            if (this.options.service === 'pjsip') {
                channel = extension === 'none' ? `PJSIP/${telnr}` : `PJSIP/${telnr}@${extension}`;
            } else {
                channel = extension === 'none' ? `SIP/${telnr}` : `SIP/${extension}/${telnr}`;
            }
            const guid = tools.getGuid();
            const options: any = {
                action: 'originate',
                channel: channel,
                context: parameter.context || 'ael-ansage',
                exten: parameter.exten || telnr,
                priority: parameter.priority || 1,
                actionid: guid,
                timeout: parameter.timeout || 60 * 1000,
                variable: {
                    repeat: parameter.repeat || 5,
                    file: parameter.audiofile,
                    del: parameter.delete || '',
                },
            };

            if (Object.prototype.hasOwnProperty.call(parameter, 'async')) {
                options.async = parameter.async;
            }
            if (Object.prototype.hasOwnProperty.call(parameter, 'callerid')) {
                options.callerid = tools.textToNumber(parameter.callerid);
            }
            if (Object.prototype.hasOwnProperty.call(parameter, 'variable')) {
                options.variable = parameter.variable;
            }
            const result = await this.actionAsync(options);
            resultarray.push(result);
        }
        return resultarray;
    }

    /**
     * AMI action
     *
     * @param parameter dial parameter
     * @param callback callback function
     */
    public action(parameter: Record<string, string> & { action: string }, callback: any): void {
        const guid = tools.getGuid();
        this.ami.action(parameter, (err: any, res: any) => {
            const result = {
                parameter: parameter,
                guid: guid,
                result: res,
            };
            callback && callback(err, result);
        });
    }

    /**
     * AMI action async
     *
     * @param parameter dial parameter
     * @returns result of aciton
     */
    public async actionAsync(
        parameter: Record<string, string> & { action: string },
    ): Promise<{ parameter: Record<string, string> & { action: string }; guid: string; result: any }> {
        return new Promise((resolve, reject) => {
            const guid = tools.getGuid();
            this.ami.action(parameter, (err: any, res: any) => {
                if (err) {
                    reject(new Error(`Error excuting action ${err.message}`));
                }
                const result = {
                    parameter: parameter,
                    guid: guid,
                    result: res,
                };
                resolve(result);
            });
        });
    }
}

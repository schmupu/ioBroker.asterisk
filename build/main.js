"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var fs = __toESM(require("fs"));
var import_node_path = __toESM(require("node:path"));
var import_ami = require("./lib/ami");
var tools = __toESM(require("./lib/tools"));
var import_transcode = require("./lib/transcode");
class asterisk extends utils.Adapter {
  onlineCheckAvailable;
  onlineCheckTimeout;
  sshconfig;
  configfiles;
  asterisk;
  tmppath;
  timeouthandler;
  constructor(options = {}) {
    super({
      ...options,
      name: "asterisk"
    });
    this.configfiles = [
      "pjsip_telekom.conf.template",
      "pjsip_fritzbox.conf.template",
      "pjsip_sipgate.conf.template",
      "sip_fritzbox.conf.template",
      "extensions.ael.template",
      "manager.conf.template",
      "rtp.conf.template"
    ];
    this.tmppath = tools.isWindow() ? tools.addSlashToPath("c:\\temp\\") : tools.addSlashToPath("/tmp/");
    this.onlineCheckAvailable = false;
    this.onlineCheckTimeout = void 0;
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("objectChange", this.onObjectChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    await this.setState("info.connection", { val: true, ack: true });
    this.subscribeStates("*");
    this.log.info(
      `Starting Adapter ${this.namespace} in version ${this.version} with transcoder ${this.config.transcoder} and language ${this.config.language}`
    );
    this.sshconfig = {
      host: this.config.ip,
      username: this.config.sshuser,
      port: this.config.sshport,
      password: this.config.sshpassword,
      tryKeyboard: true,
      onKeyboardInteractive: (name, instructions, instructionsLang, prompts, finish) => {
        if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes("password")) {
          finish([this.config.sshpassword]);
        }
      }
    };
    try {
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
  async onUnload(callback) {
    try {
      this.log.info(`Stopping asterisk processes, please wait!`);
      await this.asteriskDisconnect();
      await this.setState("info.connection", { val: false, ack: true });
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
  async onObjectChange(id, obj) {
  }
  /**
   * Is called if a subscribed state changes
   *
   * @param id id of state
   * @param state state
   */
  async onStateChange(id, state) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    if (state && !state.ack) {
      const stateId = id.replace(`${this.namespace}.`, "");
      this.log.debug(`Call of onStateChange for ${stateId}: ${JSON.stringify(state)}`);
      if (stateId == "dialin.text") {
        const tmppath = tools.addSlashToPath(this.config.path) || this.tmppath;
        const text = ((_a = state.val) == null ? void 0 : _a.toString()) || "";
        const language = ((_c = (_b = await this.getStateAsync("dialin.callerid")) == null ? void 0 : _b.val) == null ? void 0 : _c.toString()) || this.config.language;
        try {
          await this.createDialInFile(text, `${tmppath}asterisk_dtmf`, language);
          await this.setStateChangedAsync("dialin.text", { ack: true });
          await this.setStateChangedAsync("dialin.language", { ack: true });
        } catch (err) {
          this.log.error(`Error in onStateChange: ${stateId}:  ${tools.getErrorMessage(err)}`);
        }
      }
      if (stateId == "dialout.call") {
        const parameter = {
          callerid: ((_e = (_d = await this.getStateAsync("dialout.callerid")) == null ? void 0 : _d.val) == null ? void 0 : _e.toString()) || "",
          text: ((_g = (_f = await this.getStateAsync("dialout.text")) == null ? void 0 : _f.val) == null ? void 0 : _g.toString()) || "",
          telnr: ((_i = (_h = await this.getStateAsync("dialout.telnr")) == null ? void 0 : _h.val) == null ? void 0 : _i.toString()) || "",
          language: ((_k = (_j = await this.getStateAsync("dialout.language")) == null ? void 0 : _j.val) == null ? void 0 : _k.toString()) || this.config.language
        };
        try {
          await this.asteriskConnect();
          await this.asteriskDial(parameter);
          await this.setStateChangedAsync("dialout.call", { ack: true });
          await this.setStateChangedAsync("dialout.callerid", { ack: true });
          await this.setStateChangedAsync("dialout.telnr", { ack: true });
          await this.setStateChangedAsync("dialout.text", { ack: true });
          await this.setStateChangedAsync("dialout.language", { ack: true });
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
  async onMessage(obj) {
    if (typeof obj === "object" && obj.message) {
      switch (obj.command) {
        case "dial": {
          const parameter = obj.message;
          try {
            await this.asteriskConnect();
            const result = await this.asteriskDial(parameter);
            if (obj.callback) {
              this.sendTo(obj.from, obj.command, { result, error: void 0 }, obj.callback);
            }
          } catch (err) {
            this.sendTo(
              obj.from,
              obj.command,
              { result: void 0, error: tools.getErrorMessage(err) },
              obj.callback
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
  async initStates() {
    var _a, _b, _c, _d;
    this.log.debug(`Init default States`);
    const dialin_txt = ((_a = await this.getStateAsync("dialin.text")) == null ? void 0 : _a.val) || "Please enter after the beep tone your passwort and press hashtag.";
    const dialout_txt = ((_b = await this.getStateAsync("dialout.text")) == null ? void 0 : _b.val) || "Please enter after the beep tone your passwort and press hashtag.";
    const dialin_language = ((_c = await this.getStateAsync("dialin.language")) == null ? void 0 : _c.val) || this.config.language;
    const dialout_language = ((_d = await this.getStateAsync("dialout.language")) == null ? void 0 : _d.val) || this.config.language;
    await this.setStateChangedAsync("dialout.language", { val: dialout_language, ack: true });
    await this.setStateChangedAsync("dialin.language", { val: dialin_language, ack: true });
    await this.setStateChangedAsync("dialout.text", { val: dialout_txt, ack: true });
    await this.setStateChangedAsync("dialin.text", { val: dialin_txt, ack: true });
    await this.setState("dialin.dtmf", { val: "", ack: true });
    await this.setState("dialin.callerid", { val: "", ack: true });
  }
  /**
   * Create Config Files
   *
   * @returns void
   */
  async createConfigFiles() {
    this.log.debug(`Starting createConfigFiles`);
    if (!this.config.forceReInit) {
      return;
    }
    const config = this.config;
    config.sipusercountry = `+49${config.sipuser.slice(1)}`;
    try {
      for (const file of this.configfiles) {
        if (!file.startsWith(this.config.service) && file.match(/^(sip|pjsip)/)) {
          continue;
        }
        const tmppath = this.tmppath;
        const srcfile = tools.isWindow() ? `${this.adapterDir}\\template\\${file}` : `${this.adapterDir}/template/${file}`;
        const dstfile = `${tmppath}${file.replace(".template", "")}`;
        this.log.debug(`Read file ${srcfile}`);
        let dstcontent = fs.readFileSync(srcfile, { encoding: "utf8" });
        for (const i in config) {
          const search = `\${${i}}`;
          const value = config[i];
          dstcontent = dstcontent.split(search).join(value);
        }
        this.log.debug(`Write config file ${dstfile}`);
        fs.writeFileSync(dstfile, dstcontent, { encoding: "utf8" });
        if (this.config.ssh) {
          this.log.info(
            `Transfering Config File: scp ${dstfile} ${this.config.sshuser}@${this.config.ip}:${dstfile}`
          );
          await tools.sendSSH(dstfile, dstfile, this.sshconfig);
          this.log.info(
            `Create config file ${dstfile} on server ${this.config.ip} for asterisk. Please rename it and move it to /etc/asterisk/`
          );
          this.log.debug(`Delete file ${dstfile}`);
          fs.unlinkSync(dstfile);
        } else {
          this.log.info(
            `Create config file ${dstfile} for asterisk. Please rename it and  move it to /etc/asterisk/`
          );
        }
      }
      await this.extendForeignObject(`system.adapter.${this.namespace}`, { native: { forceReInit: false } });
    } catch (err) {
      this.log.error(`Error, could not create configfile. ${tools.getErrorMessage(err)}`);
    }
  }
  /**
   * Asterisk Action
   *
   * @param parameter paramter
   */
  async asteriskAction(parameter) {
    var _a;
    this.log.debug(`Starting asteriskAction`);
    if (!parameter.audiofile && !parameter.text) {
      throw new Error(`Text or audiofile are missing!`);
    }
    if (parameter.audiofile && parameter.text) {
      throw new Error(`Text or audiofile, but not both!`);
    }
    if (!((_a = this.asterisk) == null ? void 0 : _a.isConnected())) {
      throw new Error(`No connection to Asterisk!`);
    }
    const msgid = tools.getGuid();
    const tmppath = this.tmppath;
    const audiofile_gsm = `${tmppath}audio_${msgid}.gsm`;
    parameter.language = parameter.language ? parameter.language : this.config.language;
    parameter.extension = parameter.extension ? parameter.extension : this.config.sipuser;
    const converter = new import_transcode.TextToGSMConverter({
      transcoder: this.config.transcoder,
      language: parameter.language
    });
    if (!parameter.audiofile && parameter.text) {
      await converter.textToGsm(parameter.text, audiofile_gsm);
    }
    if (parameter.audiofile && !parameter.text) {
      if (parameter.audiofile && !fs.existsSync(parameter.audiofile)) {
        throw new Error(`Auddiofile ${parameter.audiofile} is missing`);
      }
      switch (import_node_path.default.extname(parameter.audiofile).toLowerCase()) {
        case ".mp3":
          await converter.mp3ToGsm(parameter.audiofile, audiofile_gsm);
          if (parameter.delete === "delete") {
            this.log.debug(`Delete file ${parameter.audiofile}`);
            fs.unlinkSync(parameter.audiofile);
          }
          break;
        case ".gsm":
          if (parameter.delete === "delete") {
            this.log.debug(`Move file ${parameter.audiofile} to ${audiofile_gsm}`);
            fs.renameSync(parameter.audiofile, audiofile_gsm);
          } else {
            this.log.debug(`Copy file ${parameter.audiofile} to ${audiofile_gsm}`);
            fs.copyFileSync(parameter.audiofile, audiofile_gsm);
          }
          break;
        default:
          throw new Error(`Audiofile ${parameter.audiofile} must have ending .mp3 or .gsm`);
      }
    }
    if (this.config.ssh) {
      const audiofile_ssh_gsm = tools.addSlashToPath(this.config.path) + import_node_path.default.basename(audiofile_gsm);
      this.log.debug(`scp ${audiofile_gsm} ${this.config.sshuser}@${this.config.ip}:${audiofile_ssh_gsm}`);
      await tools.sendSSH(audiofile_gsm, audiofile_ssh_gsm, this.sshconfig);
      this.log.debug(`Delete file ${audiofile_gsm}`);
      fs.unlinkSync(audiofile_gsm);
      parameter.audiofile = tools.getFilenameWithoutExtension(audiofile_ssh_gsm);
      parameter.delete = "delete";
    } else {
      parameter.audiofile = tools.getFilenameWithoutExtension(audiofile_gsm);
      parameter.delete = "delete";
    }
    this.log.debug(`Message: ${JSON.stringify(parameter)}`);
    this.log.debug("AMI Command");
    const result = await this.asterisk.dialAsync(parameter);
    this.log.debug(`AMI Result : ${JSON.stringify(result)}`);
    return result;
  }
  /**
   * Asterisk Dial
   *
   * @param parameter parameter
   */
  async asteriskDial(parameter) {
    this.log.debug(`Starting asteriskDial`);
    const result = await this.asteriskAction(parameter);
    if (parameter.telnr) {
      await this.setState("dialout.telnr", parameter.telnr, true);
    }
    if (parameter.text) {
      await this.setState("dialout.text", parameter.text, true);
    }
    if (parameter.callerid) {
      await this.setState("dialout.callerid", parameter.callerid, true);
    }
    return result;
  }
  /**
   * start Astersisk
   */
  async startAsterisk() {
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
    }, 10 * 1e3);
  }
  /**
   * Connect to Asterisk AMI
   */
  async asteriskConnect() {
    let start = false;
    if (!this.asterisk) {
      this.log.debug(`Connect to Asterisk`);
      this.asterisk = new import_ami.AsteriskManager({
        port: this.config.port,
        hostname: this.config.ip,
        username: this.config.user,
        password: this.config.password,
        service: this.config.service
      });
      start = true;
    } else {
      this.log.debug(`Reconnect to Asterisk`);
      try {
        await this.asterisk.reconnectAsync();
      } catch (err) {
        this.log.debug(`Reconnect to Asterisk was not succesfull. Restarting Aseterisk`);
        try {
          await this.asteriskDisconnect();
        } catch (err2) {
        }
        this.asterisk = new import_ami.AsteriskManager({
          port: this.config.port,
          hostname: this.config.ip,
          username: this.config.user,
          password: this.config.password,
          service: this.config.service
        });
        start = true;
      }
    }
    let count = 0;
    while (!this.asterisk.isConnected()) {
      count++;
      if (count > 1e3) {
        throw new Error(`Could not connect to Asterisk`);
      }
      await tools.wait(20 / 1e3);
    }
    return start;
  }
  /**
   * Disconnect from Asterix AMI
   */
  async asteriskDisconnect() {
    if (this.asterisk) {
      this.log.debug(`Disconnecting from Asterisk`);
      if (this.timeouthandler) {
        this.clearTimeout(this.timeouthandler);
      }
      await this.asterisk.disconnectAsync();
      let count = 0;
      while (this.asterisk.isConnected()) {
        count++;
        if (count > 1e3) {
          throw new Error(`Could not disconnect to Asterisk`);
        }
        await tools.wait(20 / 1e3);
      }
    }
  }
  /**
   * Answer Asterisk Call
   */
  async asteriskAnswerCall() {
    var _a, _b, _c, _d, _e;
    this.log.debug(`Starting asteriskAnswerCall`);
    const vars = {};
    const text = ((_b = (_a = await this.getStateAsync("dialin.text")) == null ? void 0 : _a.val) == null ? void 0 : _b.toString()) || "Please enter after the beep tone your passwort and press hashtag!";
    const language = ((_d = (_c = await this.getStateAsync("dialin.callerid")) == null ? void 0 : _c.val) == null ? void 0 : _d.toString()) || this.config.language;
    const tmppath = tools.addSlashToPath(this.config.path) || this.tmppath;
    const audiofile = `${tmppath}asterisk_dtmf`;
    await this.createDialInFile(text, audiofile, language);
    (_e = this.asterisk) == null ? void 0 : _e.on("managerevent", async (evt) => {
      this.log.debug(`Management Events ${JSON.stringify(evt)}`);
      if (evt.event == "VarSet" && evt.variable) {
        for (const i in evt.variable) {
          if (!vars[i] || vars[i].uniqueid != evt.uniqueid || vars[i].value != evt.value) {
            vars[i] = {
              uniqueid: evt.uniqueid,
              value: evt.value
            };
            this.log.debug(`Variable: ${i} = ${evt.value}`);
            if (evt.context == "ael-antwort" && i == "dtmf") {
              await this.setState("dialin.callerid", { val: evt.calleridnum, ack: true });
              await this.setState("dialin.dtmf", { val: evt.value, ack: true });
            }
            if (evt.context == "ael-ansage" && i == "dtmf") {
              await this.setState("dialout.dtmf", { val: evt.value, ack: true });
            }
          }
        }
      }
    });
  }
  /**
   * Create Dial In File
   *
   * @param text text to convert to a gsm file
   * @param audiofile output filename (wiht ending gsm)
   * @param language language
   */
  async createDialInFile(text, audiofile, language) {
    this.log.debug(`Starting createDialInFile`);
    language = language ? language : this.config.language;
    const converter = new import_transcode.TextToGSMConverter({
      transcoder: this.config.transcoder,
      language
    });
    const tmppath = this.tmppath;
    audiofile = audiofile ? audiofile : `${tmppath}asterisk_dtmf`;
    const tmpfile = this.config.ssh ? `${tmppath}asterisk_dtmf` : audiofile || `${tmppath}asterisk_dtmf`;
    text = text || "Please enter after the beep tone your passwort and press hashtag.";
    await converter.textToGsm(text, `${tmpfile}.gsm`);
    this.log.debug(`Converting completed.`);
    if (this.config.ssh) {
      const srcfile = `${tmpfile}.gsm`;
      const dstfile = `${audiofile}.gsm`;
      this.log.debug(`scp ${srcfile} ${this.config.sshuser}@${this.config.ip}:${dstfile}`);
      await tools.sendSSH(srcfile, dstfile, this.sshconfig);
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new asterisk(options);
} else {
  (() => new asterisk())();
}
//# sourceMappingURL=main.js.map

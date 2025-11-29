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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    if (state && !state.ack) {
      const stateId = id.replace(`${this.namespace}.`, "");
      this.log.debug(`Call of onStateChange for ${stateId}: ${JSON.stringify(state)}`);
      if (stateId === "dialin.create") {
        const text = ((_b = (_a = await this.getStateAsync("dialin.text")) == null ? void 0 : _a.val) == null ? void 0 : _b.toString()) || "";
        const language = ((_d = (_c = await this.getStateAsync("dialin.language")) == null ? void 0 : _c.val) == null ? void 0 : _d.toString()) || this.config.language;
        try {
          await this.createDialInFile({ text, language });
          await this.setStateChangedAsync("dialin.create", { ack: true });
          await this.setStateChangedAsync("dialin.text", { ack: true });
          await this.setStateChangedAsync("dialin.language", { ack: true });
        } catch (err) {
          this.log.error(`Error in onStateChange: ${stateId}:  ${tools.getErrorMessage(err)}`);
        }
      }
      if (stateId === "dialout.call") {
        const parameter = {
          callerid: ((_f = (_e = await this.getStateAsync("dialout.callerid")) == null ? void 0 : _e.val) == null ? void 0 : _f.toString()) || "",
          text: ((_h = (_g = await this.getStateAsync("dialout.text")) == null ? void 0 : _g.val) == null ? void 0 : _h.toString()) || "",
          repeat: ((_i = await this.getStateAsync("dialout.repeat")) == null ? void 0 : _i.val) || 5,
          telnr: ((_k = (_j = await this.getStateAsync("dialout.telnr")) == null ? void 0 : _j.val) == null ? void 0 : _k.toString()) || "",
          language: ((_m = (_l = await this.getStateAsync("dialout.language")) == null ? void 0 : _l.val) == null ? void 0 : _m.toString()) || this.config.language
        };
        try {
          await this.asteriskConnect();
          await this.asteriskDial(parameter);
          await this.setStateChangedAsync("dialout.call", { ack: true });
          await this.setStateChangedAsync("dialout.callerid", { ack: true });
          await this.setStateChangedAsync("dialout.telnr", { ack: true });
          await this.setStateChangedAsync("dialout.text", { ack: true });
          await this.setStateChangedAsync("dialout.repeat", { ack: true });
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
    var _a, _b;
    if (typeof obj === "object" && obj.message) {
      switch (obj.command) {
        case "dial": {
          const parameter = obj.message;
          try {
            await this.asteriskConnect();
            const result = await this.asteriskDial(parameter);
            await this.setState("dialout.telnr", { val: (parameter == null ? void 0 : parameter.telnr) || "", ack: true });
            await this.setState("dialout.text", { val: (parameter == null ? void 0 : parameter.text) || "", ack: true });
            await this.setState("dialout.repeat", { val: (parameter == null ? void 0 : parameter.repeat) || 5, ack: true });
            await this.setState("dialout.language", {
              val: (parameter == null ? void 0 : parameter.language) || this.config.language,
              ack: true
            });
            await this.setState("dialout.callerid", { val: (parameter == null ? void 0 : parameter.callerid) || "", ack: true });
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
        case "action": {
          const parameter = (_a = obj.message) == null ? void 0 : _a.parameter;
          const atoptions = (_b = obj.message) == null ? void 0 : _b.at;
          try {
            await this.asteriskConnect();
            const result = await this.asteriskAction(parameter, atoptions);
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
        case "dialin": {
          const atoptions = obj.message;
          try {
            const language = (atoptions == null ? void 0 : atoptions.language) ? atoptions == null ? void 0 : atoptions.language : this.config.language;
            const text = atoptions.text;
            const audiofile = atoptions.audiofile;
            await this.createDialInFile({ text, audiofile, language });
            if (obj.callback) {
              this.sendTo(obj.from, obj.command, { result: true, error: void 0 }, obj.callback);
            }
          } catch (err) {
            this.sendTo(
              obj.from,
              obj.command,
              { result: false, error: tools.getErrorMessage(err) },
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    this.log.debug(`Init default States`);
    const dialin_text = ((_b = (_a = await this.getStateAsync("dialin.text")) == null ? void 0 : _a.val) == null ? void 0 : _b.toString()) || "Please enter after the beep tone your passwort and press hashtag.";
    const dialout_text = ((_d = (_c = await this.getStateAsync("dialout.text")) == null ? void 0 : _c.val) == null ? void 0 : _d.toString()) || "Please enter after the beep tone your passwort and press hashtag.";
    const dialout_repeat = ((_e = await this.getStateAsync("dialout.repeat")) == null ? void 0 : _e.val) || 5;
    const dialin_language = ((_g = (_f = await this.getStateAsync("dialin.language")) == null ? void 0 : _f.val) == null ? void 0 : _g.toString()) || this.config.language;
    const dialout_language = ((_i = (_h = await this.getStateAsync("dialout.language")) == null ? void 0 : _h.val) == null ? void 0 : _i.toString()) || this.config.language;
    await this.setStateChangedAsync("dialout.language", { val: dialout_language, ack: true });
    await this.setStateChangedAsync("dialin.language", { val: dialin_language, ack: true });
    await this.setStateChangedAsync("dialout.text", { val: dialout_text, ack: true });
    await this.setStateChangedAsync("dialout.repeat", { val: dialout_repeat, ack: true });
    await this.setStateChangedAsync("dialin.text", { val: dialin_text, ack: true });
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
  async getGuidGsmFile(atoptions) {
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
    const converter = new import_transcode.TextToGSMConverter({
      transcoder: this.config.transcoder,
      language
    });
    if (atoptions.text) {
      await converter.textToGsm(atoptions.text, audiofile_guid_gsm);
    }
    if (atoptions.audiofile) {
      switch (import_node_path.default.extname(atoptions.audiofile).toLowerCase()) {
        case ".mp3":
          await converter.mp3ToGsm(atoptions.audiofile, audiofile_guid_gsm);
          break;
        case ".gsm":
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
  async createPath(path2) {
    if (this.config.ssh) {
      this.log.info(`Creating path ${path2} on ${this.config.sshuser}@${this.config.ip} if not exist!`);
      await tools.mkdirdSSH(path2, this.sshconfig);
    } else {
      if (!fs.existsSync(path2)) {
        this.log.info(`Creating path ${path2}!`);
        fs.mkdirSync(path2, { recursive: true });
      }
    }
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
   * Asterisk action
   *
   * @param parameter AMI Paramter
   * @param atoptions text or audiofile (optional)
   * @param atoptions.text text (optional)
   * @param atoptions.audiofile audiofile (optional)
   * @param atoptions.language language (optional)
   * @returns result
   */
  async asteriskAction(parameter, atoptions) {
    var _a;
    this.log.debug(`Starting asteriskAction`);
    if (!((_a = this.asterisk) == null ? void 0 : _a.isConnected())) {
      throw new Error(`No connection to Asterisk!`);
    }
    const audiofile_guid_gsm = await this.getGuidGsmFile({
      text: atoptions == null ? void 0 : atoptions.text,
      audiofile: atoptions == null ? void 0 : atoptions.audiofile,
      language: atoptions == null ? void 0 : atoptions.language
    });
    if (this.config.ssh) {
      const audiofile_ssh_gsm = tools.addSlashToPath(this.config.path) + import_node_path.default.basename(audiofile_guid_gsm);
      this.log.debug(`scp ${audiofile_guid_gsm} ${this.config.sshuser}@${this.config.ip}:${audiofile_ssh_gsm}`);
      await tools.sendSSH(audiofile_guid_gsm, audiofile_ssh_gsm, this.sshconfig);
      this.log.debug(`Delete file ${audiofile_guid_gsm}`);
      fs.unlinkSync(audiofile_guid_gsm);
      if (parameter.variable) {
        parameter.variable.file = tools.getFilenameWithoutExtension(audiofile_ssh_gsm);
        parameter.variable.del = "delete";
      } else {
        parameter.variable = {
          file: tools.getFilenameWithoutExtension(audiofile_ssh_gsm),
          del: "delete"
        };
      }
    }
    if (!this.config.ssh) {
      const audiofile_local_gsm = tools.addSlashToPath(this.config.path) + import_node_path.default.basename(audiofile_guid_gsm);
      this.log.debug(`move ${audiofile_guid_gsm} ${audiofile_local_gsm}`);
      fs.copyFileSync(audiofile_guid_gsm, audiofile_local_gsm);
      fs.rmSync(audiofile_guid_gsm);
      if (parameter.variable) {
        parameter.variable.file = tools.getFilenameWithoutExtension(audiofile_local_gsm);
        parameter.variable.del = "delete";
      } else {
        parameter.variable = {
          file: tools.getFilenameWithoutExtension(audiofile_local_gsm),
          del: "delete"
        };
      }
    }
    this.log.debug(`Message: ${JSON.stringify(parameter)}`);
    this.log.debug("AMI Command");
    const result = await this.asterisk.actionAsync(parameter);
    this.log.debug(`AMI Result : ${JSON.stringify(result)}`);
    return result;
  }
  /**
   * Asterisk Dial
   *
   * @param parameter parameter
   */
  async asteriskDial(parameter) {
    var _a;
    this.log.debug(`Starting asteriskDial`);
    if (!((_a = this.asterisk) == null ? void 0 : _a.isConnected())) {
      throw new Error(`No connection to Asterisk!`);
    }
    const audiofile_guid_gsm = await this.getGuidGsmFile({
      text: parameter == null ? void 0 : parameter.text,
      audiofile: parameter == null ? void 0 : parameter.audiofile,
      language: parameter == null ? void 0 : parameter.language
    });
    parameter.language = parameter.language ? parameter.language : this.config.language;
    parameter.extension = parameter.extension ? parameter.extension : this.config.sipuser;
    if (this.config.ssh) {
      const audiofile_ssh_gsm = tools.addSlashToPath(this.config.path) + import_node_path.default.basename(audiofile_guid_gsm);
      this.log.debug(`scp ${audiofile_guid_gsm} ${this.config.sshuser}@${this.config.ip}:${audiofile_ssh_gsm}`);
      await tools.sendSSH(audiofile_guid_gsm, audiofile_ssh_gsm, this.sshconfig);
      this.log.debug(`Delete file ${audiofile_guid_gsm}`);
      fs.unlinkSync(audiofile_guid_gsm);
      parameter.audiofile = tools.getFilenameWithoutExtension(audiofile_ssh_gsm);
      parameter.delete = "delete";
    }
    if (!this.config.ssh) {
      const audiofile_local_gsm = tools.addSlashToPath(this.config.path) + import_node_path.default.basename(audiofile_guid_gsm);
      this.log.debug(`move ${audiofile_guid_gsm} ${audiofile_local_gsm}`);
      fs.copyFileSync(audiofile_guid_gsm, audiofile_local_gsm);
      fs.rmSync(audiofile_guid_gsm);
      parameter.audiofile = tools.getFilenameWithoutExtension(audiofile_local_gsm);
      parameter.delete = "delete";
    }
    this.log.debug(`Message: ${JSON.stringify(parameter)}`);
    this.log.debug("AMI Command");
    const result = await this.asterisk.dialAsync(parameter);
    this.log.debug(`AMI Result : ${JSON.stringify(result)}`);
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
      try {
        await this.asterisk.disconnectAsync();
        let count = 0;
        while (this.asterisk.isConnected()) {
          count++;
          if (count > 1e3) {
            throw new Error(`Could not disconnect to Asterisk`);
          }
          await tools.wait(20 / 1e3);
        }
      } catch (err) {
      }
    }
  }
  /**
   * Answer Asterisk Call
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async asteriskAnswerCall() {
    var _a;
    this.log.debug(`Starting asteriskAnswerCall`);
    const vars = {};
    (_a = this.asterisk) == null ? void 0 : _a.on("managerevent", async (evt) => {
      this.log.debug(`Management Events ${JSON.stringify(evt)}`);
      if (evt.event == "VarSet" && evt.variable) {
        for (const i in evt.variable) {
          if (!vars[i] || vars[i].uniqueid != evt.uniqueid || vars[i].value != evt.value) {
            vars[i] = {
              uniqueid: evt.uniqueid,
              value: evt.value
            };
            this.log.debug(`Variable: ${i} = ${evt.value}`);
            if (evt.context == "ael-antwort" && i == "dtmf" && evt.value != "") {
              await this.setState("dialin.callerid", { val: evt.calleridnum, ack: true });
              await this.setState("dialin.dtmf", { val: evt.value, ack: true });
            }
            if (evt.context == "ael-ansage" && i == "dtmf" && evt.value != "") {
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
   * @param atoptions text, audofile and language
   * @param atoptions.text text to convert to a gsm file
   * @param atoptions.audiofile output filename (wiht ending gsm)
   * @param atoptions.language language
   */
  async createDialInFile(atoptions) {
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
      fs.copyFileSync(audiofile_guid_gsm, audiofile_dtmf_gsm);
      fs.rmSync(audiofile_guid_gsm);
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new asterisk(options);
} else {
  (() => new asterisk())();
}
//# sourceMappingURL=main.js.map

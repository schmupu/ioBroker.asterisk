"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var ami_exports = {};
__export(ami_exports, {
  AsteriskManager: () => AsteriskManager
});
module.exports = __toCommonJS(ami_exports);
var import_asterisk_manager = __toESM(require("asterisk-manager"));
var tools = __toESM(require("./tools"));
class AsteriskManager {
  ami;
  options;
  constructor(options) {
    this.options = {
      port: options.port,
      hostname: options.hostname,
      username: options.username,
      password: options.password,
      service: options.service || "sip",
      events: options.events || false
    };
    this.ami = new import_asterisk_manager.default(
      this.options.port,
      this.options.hostname,
      this.options.username,
      this.options.password,
      this.options.events
    );
  }
  /**
   * Get AMI instance
   *
   * @returns AMI insatnce
   */
  getAmi() {
    return this.ami;
  }
  /**
   * Eventhandler for asterisk class
   *
   * @param eventname name of event
   * @param callback callback function
   */
  on(eventname, callback) {
    if (eventname.length > 0 && callback) {
      this.ami.on(eventname, (evt) => {
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
  isConnected() {
    return this.ami.isConnected();
  }
  /**
   * Connect to AMI
   *
   * @param callback callback
   */
  connect(callback) {
    this.ami.connect(this.options.port, this.options.hostname, callback);
  }
  /**
   * Connect to AMI async
   *
   * @returns void
   */
  async connectAsync() {
    return new Promise((resolve, reject) => {
      this.ami.connect(this.options.port, this.options.hostname, () => {
        resolve();
      });
      reject(new Error("Could not connect to asterisk!"));
    });
  }
  /**
   * disconnect from AMI
   *
   * @param callback callback function
   */
  disconnect(callback) {
    this.ami.disconnect(callback);
  }
  /**
   * disconnect from AMI
   *
   * @returns void
   */
  async disconnectAsync() {
    return new Promise((resolve, reject) => {
      this.ami.disconnect(() => {
        resolve();
      });
      reject(new Error("Could not disconnect!"));
    });
  }
  /**
   * keep connected to AMI
   */
  keepConnected() {
    this.ami.keepConnected();
  }
  /**
   * login to AMI
   *
   * @param callback callback function
   */
  login(callback) {
    this.ami.login(callback);
  }
  /**
   * login to AMI async
   *
   * @returns void
   */
  async loginAsync() {
    return new Promise((resolve, reject) => {
      this.ami.login(() => {
        resolve();
      });
      reject(new Error("Could not login!"));
    });
  }
  /**
   * reconnect to AMI
   *
   * @param callback callback function
   */
  reconnect(callback) {
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
  async reconnectAsync() {
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
  dial(parameter, callback) {
    if (!parameter) {
      return;
    }
    const telnrs = typeof parameter.telnr === "string" ? Array(parameter.telnr) : parameter.telnr;
    const extension = parameter.extension || "none";
    const resultarray = [];
    for (const i in telnrs) {
      const telnr = tools.textToNumber(telnrs[i]);
      let channel;
      if (this.options.service === "pjsip") {
        channel = extension === "none" ? `PJSIP/${telnr}` : `PJSIP/${telnr}@${extension}`;
      } else {
        channel = extension === "none" ? `SIP/${telnr}` : `SIP/${extension}/${telnr}`;
      }
      const guid = tools.getGuid();
      const options = {
        action: "originate",
        channel,
        context: parameter.context || "ael-ansage",
        exten: parameter.exten || telnr,
        priority: parameter.priority || 1,
        actionid: guid,
        timeout: parameter.timeout || 60 * 1e3,
        variable: {
          repeat: parameter.repeat || 5,
          file: parameter.audiofile,
          del: parameter.delete || ""
        }
      };
      if (Object.prototype.hasOwnProperty.call(parameter, "async")) {
        options.async = parameter.async;
      }
      if (Object.prototype.hasOwnProperty.call(parameter, "callerid")) {
        options.callerid = tools.textToNumber(parameter.callerid);
      }
      if (Object.prototype.hasOwnProperty.call(parameter, "variable")) {
        options.variable = parameter.variable;
      }
      this.ami.action(options, (err, res) => {
        const result = {
          parameter,
          options,
          guid,
          result: res
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
  async dialAsync(parameter) {
    if (!parameter) {
      return;
    }
    const telnrs = typeof parameter.telnr === "string" ? Array(parameter.telnr) : parameter.telnr;
    const extension = parameter.extension || "none";
    const resultarray = [];
    for (const i in telnrs) {
      const telnr = tools.textToNumber(telnrs[i]);
      let channel;
      if (this.options.service === "pjsip") {
        channel = extension === "none" ? `PJSIP/${telnr}` : `PJSIP/${telnr}@${extension}`;
      } else {
        channel = extension === "none" ? `SIP/${telnr}` : `SIP/${extension}/${telnr}`;
      }
      const guid = tools.getGuid();
      const options = {
        action: "originate",
        channel,
        context: parameter.context || "ael-ansage",
        exten: parameter.exten || telnr,
        priority: parameter.priority || 1,
        actionid: guid,
        timeout: parameter.timeout || 60 * 1e3,
        variable: {
          repeat: parameter.repeat || 5,
          file: parameter.audiofile,
          del: parameter.delete || ""
        }
      };
      if (Object.prototype.hasOwnProperty.call(parameter, "async")) {
        options.async = parameter.async;
      }
      if (Object.prototype.hasOwnProperty.call(parameter, "callerid")) {
        options.callerid = tools.textToNumber(parameter.callerid);
      }
      if (Object.prototype.hasOwnProperty.call(parameter, "variable")) {
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
  action(parameter, callback) {
    const guid = tools.getGuid();
    this.ami.action(parameter, (err, res) => {
      const result = {
        parameter,
        guid,
        result: res
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
  async actionAsync(parameter) {
    return new Promise((resolve, reject) => {
      const guid = tools.getGuid();
      this.ami.action(parameter, (err, res) => {
        if (err) {
          reject(new Error(`Error excuting action ${err.message}`));
        }
        const result = {
          parameter,
          guid,
          result: res
        };
        resolve(result);
      });
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AsteriskManager
});
//# sourceMappingURL=ami.js.map

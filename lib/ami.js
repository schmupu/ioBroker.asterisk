/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const AsteriskManagerGlobal = require('asterisk-manager');

/**
 * convert number in text to number and delete all characters accept numbers
 * Example: (040) 123-456 -> 040123456
 * @param {string} text - number as text
 */
function textToNumber(text) {
  let numb = '';
  if (text) {
    numb = text.match(/[\d*#]/g);
    numb = numb.join('');
  }
  return numb;
}

/**
 * Create GUID
 */
function getGuid() {
  function _p8(s) {
    var p = (Math.random().toString(16) + '000000000').substr(2, 8);
    return s ? '-' + p.substr(0, 4) + '-' + p.substr(4, 4) : p;
  }
  return _p8() + _p8(true) + _p8(true) + _p8();
}

/**
 * wait ms milliseconds
 * @param {number} ms - miliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/**
 * // Asterix Manager Class. More Infos:
 *    https://github.com/pipobscure/NodeJS-AsteriskManager
 *    https://github.com/mscdex/node-asterisk
 */
class AsteriskManager {

  /**
   * Contructor
   * @param {object} config - login credentials 
   */
  constructor(config) {
    return (async () => {
      this.ami = new AsteriskManagerGlobal(config.port, config.hostname, config.username, config.password, config.events || false);
      this.options = {
        'port': config.port,
        'hostname': config.hostname,
        'username': config.username,
        'password': config.password,
        'service': config.service || 'sip',
        'events': config.events || false
      };
      return this; // when done
    })();
  }

  /**
   * Instance of Asterisk Manager
   */
  getAmi() {
    return this.ami;
  }

  asteriskEvent(eventname, callback) {
    if (eventname.length > 0 && callback) {
      this.ami.on(eventname, (evt) => {
        if (callback) callback(evt);
      });
    }
  }

  eventManager(callback) {
    this.asteriskEvent('managerevent', callback);
  }

  eventHangup(callback) {
    this.asteriskEvent('hangup', callback);
  }

  eventResponse(callback) {
    this.asteriskEvent('response', callback);
  }

  eventConfBridgeJoin(callback) {
    this.asteriskEvent('confbridgejoin', callback);
  }

  eventError(callback) {
    this.asteriskEvent('error', callback);
  }

  async disconnect() {
    return new Promise((resolve) => this.ami.disconnect());
  }

  isConnected() {
    return this.ami.isConnected();
  }

  /**
   * Wait for Manager connections
   */
  async _checkManagerConnection() {
    return new Promise((resolve, reject) => {
      let wait = 10;
      let timer = setTimeout(() => {
        reject('Could not connect to Asterisk manager. Username, password, hostname missing or wrong!');
      }, wait * 1000);
      this.asteriskEvent('managerevent', async (evt) => {
        if (evt.event === 'SuccessfulAuth') {
          clearTimeout(timer);
          resolve('Connected to Asterisk Manager!');
        }
      });
    });
  }

  /**
   * Asterisk connection
   * @param {number} counter - try x times to get a connection to asterisk
   */
  async _asteriskWaitForConnection(counter = 0) {
    try {
      if (counter > 1000) return false;
      if (!this.isConnected()) {
        counter++;
        await sleep(5);
        return await this._asteriskWaitForConnection(counter);
      } else {
        await this._checkManagerConnectionAsync();
        return true;
      }
    } catch (error) {
      return false;
    }
  }

  async _conncet() {
    let maxtries = 10;
    let sec = 30; // wait x sec.
    for (let i = 0; i < maxtries; i++) {
      this.ami = new AsteriskManagerGlobal(this.options.port, this.options.hostname, this.options.username, this.options.password, this.options.events || false);
      let connceted = await this._asteriskWaitForConnection();
      if (connceted) return true;
      await sleep(sec * 1000);
    }
    return false;
  }

  connected() {
    return this.isConnected();
  }

  async connect() {
    return new Promise((resolve) => this.ami.connect(this.options.port, this.options.hostname, resolve));
  }

  keepConnected() {
    this.ami.keepConnected();
  }

  async login() {
    return new Promise((resolve) => this.ami.login(resolve));
  }

  async reconnect() {
    if (!this.isConnected()) {
      await this.connect();
      await this.login();
    }
  }

  async dial(parameter) {
    if (!parameter) return;
    let telnrs = (typeof parameter.telnr === 'string') ? Array(parameter.telnr) : parameter.telnr;
    let extension = parameter.extension || 'none';
    let resultarray = [];
    if (parameter.delete && telnrs.length > 1) parameter.delete = ''; // not delete if array
    for (let i = 0; telnrs && i < telnrs.length; i++) {
      let telnr = textToNumber(telnrs[i]);
      let channel;
      if (this.options.service === 'pjsip') {
        channel = (extension === 'none') ? 'PJSIP/' + telnr : 'PJSIP/' + telnr + '@' + extension;
      } else {
        channel = (extension === 'none') ? 'SIP/' + telnr : 'SIP/' + extension + '/' + telnr;
      }
      let guid = getGuid();
      let options = {
        'action': 'originate',
        'channel': channel,
        'context': parameter.context || 'ael-ansage',
        'exten': parameter.exten || telnr,
        'priority': parameter.priority || 1,
        'actionid': guid,
        'timeout': parameter.timeout || (60 * 1000),
        'variable': {
          'repeat': parameter.repeat || 5,
          'file': parameter.audiofile,
          'del': parameter.delete || ''
        }
      };
      if (parameter.hasOwnProperty('async')) { options.async = parameter.async; }
      if (parameter.hasOwnProperty('callerid')) { options.callerid = textToNumber(parameter.callerid); }
      if (parameter.hasOwnProperty('variable')) { options.variable = parameter.variable; }
      try {
        let result = await this.action(options);
        resultarray.push({ parameter: options, guid: guid, result: result });
      } catch (error) {
        resultarray.push({ parameter: options, guid: guid, result: error });
      }
    }
    return resultarray;
  }

  async action(parameter) {
    return new Promise((resolve, reject) => {
      let guid = getGuid();
      this.ami.action(parameter, (err, res) => {
        let result = {
          parameter: parameter,
          guid: guid,
          result: res
        };
        if (err) {
          reject(err);
          // resolve(err);
        } else {
          resolve(result);
        }
      });
    });
  }

}

module.exports = AsteriskManager;

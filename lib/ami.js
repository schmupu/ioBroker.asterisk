/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const AsteriskManagerGlobal = require('asterisk-manager');

function textToNumber(text) {
  let numb = '';
  if (text) {
    numb = text.match(/[\d*#]/g);
    numb = numb.join('');
  }
  return numb;
}

function getGuid() {
  function _p8(s) {
    var p = (Math.random().toString(16) + '000000000').substr(2, 8);
    return s ? '-' + p.substr(0, 4) + '-' + p.substr(4, 4) : p;
  }
  return _p8() + _p8(true) + _p8(true) + _p8();
}


// *****************************************************************************************************
// Asterix Manager Class. More Infos:
//  https://github.com/pipobscure/NodeJS-AsteriskManager
//  https://github.com/mscdex/node-asterisk
// *****************************************************************************************************
class AsteriskManager {

  constructor(config) {
    this.ami = new AsteriskManagerGlobal(config.port, config.hostname, config.username, config.password, config.events || false);
    this.options = {
      'port': config.port,
      'hostname': config.hostname,
      'username': config.username,
      'password': config.password,
      'service': config.service || 'sip',
      'events': config.events || false
    };
  }

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

  disconnect(callback) {
    this.ami.disconnect(callback);
  }

  isConnected() {
    return this.ami.isConnected();
  }

  connected() {
    return this.isConnected();
  }

  connect(callback) {
    this.ami.connect(this.options.port, this.options.hostname, callback);
  }

  keepConnected() {
    this.ami.keepConnected();
  }

  login(callback) {
    this.ami.login(callback);
  }

  reconnect(callback) {
    if (!this.isConnected()) {
      this.connect(() => {
        this.login(callback);
      });
    } else {
      if (callback) callback();
    }
  }

  dial(parameter, callback) {

    if (!parameter) return;

    let telnrs = (typeof parameter.telnr === 'string') ? Array(parameter.telnr) : parameter.telnr;
    let extension = parameter.extension || 'none';
    let resultarray = [];

    for (let i in telnrs) {
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
      this.ami.action(options, (err, res) => {
        let result = {
          parameter: parameter,
          options: options,
          guid: guid,
          result: res
        };
        callback && callback(err, result);
      });
      resultarray.push({ parameter: parameter, guid: guid });
    }

    return resultarray;
  }

  action(parameter, callback) {
    let guid = getGuid();
    this.ami.action(parameter, (err, res) => {
      let result = {
        parameter: parameter,
        guid: guid,
        result: res
      };
      callback && callback(err, result);
    });
  }

}

module.exports = AsteriskManager;

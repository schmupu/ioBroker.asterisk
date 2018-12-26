/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const utils = require('@iobroker/adapter-core');
var dp = require(__dirname + '/lib/datapoints');
var net = require('net');
var adapter = new utils.Adapter('asterisk');
var ami = require(__dirname + '/lib/ami');
var transcode = require(__dirname + '/lib/transcode');
var asterisk;
var systemLanguage = 'EN';


// *****************************************************************************************************
// Decrypt Password
// *****************************************************************************************************
function decrypt(key, value) {
  let result = '';
  for (let i = 0; i < value.length; ++i) {
    result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
  }
  return result;
}


// *****************************************************************************************************
// is called when adapter shuts down - callback has to be called under any circumstances!
// *****************************************************************************************************
adapter.on('unload', (callback) => {

  try {
    adapter.log.info('Closing Asterisk Adapter');
    callback();
  } catch (e) {
    adapter.log.error(e);
    callback();
  }

});

// *****************************************************************************************************
// is called when state changed
// *****************************************************************************************************
adapter.on('stateChange', function (id, state) {
  // Warning, state can be null if it was deleted
  if (state && !state.ack) {
    let stateId = id.replace(adapter.namespace + '.', '');
    adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));
    if (stateId == 'dialin.text') {
      let parameter = {
        'audiofile': '/tmp/asterisk_dtmf',
        'text': state.val
      };
      if (state.val) convertDialInFile(parameter, () => { });
      adapter.setState(stateId, state.val, true);
    }
    if (stateId == 'dialout.call') {
      let parameter = {};
      adapter.getState('dialout.telnr', (err, state) => {
        if (!err && state) {
          parameter.telnr = state.val;
          adapter.getState('dialout.text', (err, state) => {
            if (!err && state) {
              parameter.text = state.val;
              dial('dial', parameter, state.ts, (res, err) => {
                // check for error
              });
            }
          });
        }
      });
    }

  }

});

// *****************************************************************************************************
// Dial
// *****************************************************************************************************
function dial(command, parameter, msgid, callback) {

  let id = msgid;
  let tmppath = adapter.config.path || '/tmp/';
  let converter = new transcode();

  adapter.log.debug('Message: ' + JSON.stringify(parameter));

  if (tmppath.slice(-1) != '/' && tmppath.slice(-1) != '\\') {
    tmppath = tmppath + '/';
  }

  if (parameter) {
    if (command == 'dial') {
      adapter.log.debug('Dial Command');

      if (!parameter.extension) parameter.extension = adapter.config.sipuser;
      if (parameter.telnr) { adapter.setState('dialout.telnr', parameter.telnr, true); }
      if (parameter.text) { adapter.setState('dialout.text', parameter.text, true); }

      if (parameter.text && parameter.telnr) {
        if (!parameter.audiofile) parameter.audiofile = tmppath + 'audio_' + id;
        if (converter.getFilenameExtension(parameter.audiofile).toLowerCase() == 'gsm') {
          parameter.audiofile = converter.getBasename(parameter.audiofile);
        }
        let language = parameter.language || systemLanguage;
        adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
        adapter.log.debug('Start converting text message (' + parameter.text + ') to GSM audio ‚file ' + parameter.audiofile);
        converter.textToGsm(parameter.text, language, 100, parameter.audiofile + '.gsm')
          .then((file) => {
            adapter.log.debug('Converting completed. Result: ' + JSON.stringify(file));
            adapter.log.debug('Start dialing');
            // The file is converted at path "file"
            asterisk.dial(parameter, (err, res) => {
              if (err) {
                adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
              } else {
                adapter.log.debug('Dialing completed. Result: ' + JSON.stringify(res));
              }
              adapter.log.debug('Calling callback function: ' + callback);
              callback && callback(res, err);
            });
          })
          .catch((err) => {
            // An error occured
            adapter.log.error('Error while dialing (2). Error: ' + JSON.stringify(err));
            callback && callback(null, err);
          });
      } else if (parameter.audiofile && parameter.telnr) {
        if (converter.getFilenameExtension(parameter.audiofile).toLowerCase() == 'mp3') {
          let fileNameMP3 = parameter.audiofile;
          let fileNameGSM = converter.getBasename(parameter.audiofile) + '.gsm';
          parameter.audiofile = converter.getBasename(parameter.audiofile);
          adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
          adapter.log.debug('Start converting MP3 audio file ' + fileNameMP3 + ' to GSM audio file ' + fileNameGSM);
          converter.mp3ToGsm(fileNameMP3, fileNameGSM, false)
            .then((file) => {
              adapter.log.debug('Start dialing');
              // The file is converted at path "file"
              asterisk.dial(parameter, (err, res) => {
                if (err) {
                  adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
                } else {
                  adapter.log.debug('Dialing completed. Result: ' + JSON.stringify(res));
                }
                adapter.log.debug('Calling callback function: ' + callback);
                callback && callback(res, err);
              });
            })
            .catch((err) => {
              // An error occured
              adapter.log.error('Error while dialing (2). Error: ' + JSON.stringify(err));
              callback && callback(null, err);
            });
        } else if (converter.getFilenameExtension(parameter.audiofile).toLowerCase() == 'gsm') {
          // play audio file if exist
          let fileNameGSM = converter.getBasename(parameter.audiofile) + '.gsm';
          parameter.audiofile = converter.getBasename(parameter.audiofile);
          adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
          adapter.log.debug('Got GSM audio file ' + fileNameGSM);
          adapter.log.debug('Start dialing');
          asterisk.dial(parameter, (err, res) => {
            if (err) {
              adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
            } else {
              adapter.log.debug('Dialing completed. Result: ' + JSON.stringify(res));
            }
            adapter.log.debug('Calling callback function: ' + callback);
            callback && callback(res, err);
          });
        } else {
          adapter.log.error('MP3 or GSM audio file is missing');
          callback && callback(null, 'MP3 or GSM audio file is missing');
        }
      } else {
        adapter.log.error('Paramter telnr and/or text/audiofile is missing');
        callback && callback(null, 'Paramter telnr and/or text/audiofile is missing');
      }
    }

    if (command == 'action') {
      adapter.log.debug('Action Command');
      if (parameter.text) {
        if (!parameter.audiofile) parameter.audiofile = tmppath + 'audio_' + id;
        let language = parameter.language || systemLanguage;
        if (!parameter.extension) parameter.extension = adapter.config.sipuser;
        adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
        adapter.log.debug('Start converting text message (' + parameter.text + ') to GSM audio ‚file ' + parameter.audiofile);
        converter.textToGsm(parameter.text, language, 100, parameter.audiofile + ".gsm")
          .then((file) => {
            // The file is converted at path "file"
            adapter.log.debug('Start Action');
            asterisk.action(parameter, (err, res) => {
              if (err) {
                adapter.log.error('Error while Action (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
              } else {
                adapter.log.debug('Action completed. Result: ' + JSON.stringify(res));
              }
              adapter.log.debug('Calling callback function: ' + callback);
              callback && callback(res, err);
            });
          })
          .catch((err) => {
            // An error occured
            adapter.log.error('Error while dialing (2). Error: ' + JSON.stringify(err));
            callback && callback(null, err);
          });
      } else {
        adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
        adapter.log.debug('Start Action');
        asterisk.action(parameter, (err, res) => {
          if (err) {
            adapter.log.error('Error while Action (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
          } else {
            adapter.log.debug('Action completed. Result: ' + JSON.stringify(res));
          }
          adapter.log.debug('Calling callback function: ' + callback);
          callback && callback(res, err);
        });
      }
    }

  } else {
    adapter.log.error('Paramter missing');
    callback && callback(null, 'Paramter missing');
  }

}

// *****************************************************************************************************
// Listen for sendTo messages
// *****************************************************************************************************
adapter.on('message', (msg) => {

  asteriskConnect((err) => {
    if (!err) {
      adapter.log.debug("Connected to Asterisk");
      let command = msg.command;
      let parameter = msg.message;
      let callback = msg.callback;
      let id = msg._id;
      dial(command, parameter, id, (res, err) => {
        adapter.sendTo(msg.from, msg.command, { result: res, error: err }, msg.callback);
      });
    } else {
      adapter.log.error('Could not connect to Asterisk');
    }
  });
});


function initSates() {

  adapter.getState('dialin.text', (err, state) => {
    if (!err && state && !state.val) adapter.setState('dialin.text', 'Please enter after the beep tone your passwort and press hashtag.', true);
  });
  adapter.setState('dialin.dtmf', '', true);
  adapter.setState('dialin.callerid', '', true);

  adapter.getState('dialout.text', (err, state) => {
    if (!err && state && !state.val) adapter.setState('dialout.text', 'ioBroker is calling you. Please call me back', true);
  });
  adapter.setState('dialout.telnr', '', true);
  adapter.setState('dialout.dtmf', '', true);

}

// *****************************************************************************************************
// is called when databases are connected and adapter received configuration.
// start here!
// *****************************************************************************************************
adapter.on('ready', () => {
  adapter.getForeignObject('system.config', (err, obj) => {
    systemLanguage = (obj.common.language).toUpperCase();
    if (adapter.config.password) {
      if (obj && obj.native && obj.native.secret) {
        //noinspection JSUnresolvedVariable
        adapter.config.password = decrypt(obj.native.secret, adapter.config.password);
      } else {
        //noinspection JSUnresolvedVariable
        adapter.config.password = decrypt('Zgfr56gFe87jJOM', adapter.config.password);
      }
    }
    initSates();
    main();
  });
});



function asteriskWaitForConnection(callback, counter = 0) {
  if (!asterisk || counter > 1000) return callback && callback(true);
  if (!asterisk.isConnected()) {
    setTimeout(() => {
      counter++;
      asteriskWaitForConnection(callback, counter);
    }, 5);
  } else {
    callback && callback(false);
  }
}


function asteriskWaitForDisonnection(callback, counter = 0) {
  if (!asterisk || counter > 1000) return callback && callback(true);
  if (asterisk.isConnected()) {
    setTimeout(() => {
      counter++;
      asteriskWaitForDisonnection(callback, counter);
    }, 5);
  } else {
    callback && callback(false);
  }
}

function asteriskConnect(callback) {
  if (!asterisk) {
    asterisk = new ami(adapter.config.port, adapter.config.ip, adapter.config.user, adapter.config.password, false);
    // if(callback) callback();
  } else {
    asterisk.reconnect();
  }
  asteriskWaitForConnection(callback);
}

function asteriskDisconnect(callback) {
  if (asterisk && asterisk.isConnected()) {
    asterisk.disconnect();
  }
  if (callback) callback();
}

function convertDialInFile(parameter, callback) {

  let converter = new transcode();
  let language = parameter.language || systemLanguage;
  parameter.audiofile = parameter.audiofile || '/tmp/asterisk_dtmf';
  parameter.text = parameter.text || 'Please enter after the beep tone your passwort and press hashtag.';

  converter.textToGsm(parameter.text, language, 100, parameter.audiofile + '.gsm')
    .then((file) => {
      adapter.log.debug('Converting completed. Result: ' + JSON.stringify(file));
      adapter.log.debug('Listing vor Dial In Event');
      callback && callback();
    })
    .catch((err) => {
      // An error occured
      adapter.log.error('Error while Converting File: ' + JSON.stringify(err));
    });

}

function answerCall(callback) {

  let parameter = {};
  let vars = {};

  adapter.getState('dialin.text', (err, state) => {

    parameter.language = systemLanguage;
    parameter.audiofile = parameter.audiofile || '/tmp/asterisk_dtmf';
    parameter.text = !err && state && state.val ? state.val : 'Please enter after the beep tone your passwort and press hashtag!';

    convertDialInFile(parameter, () => {

      asterisk.asteriskEvent('managerevent', (evt) => {
        adapter.log.debug("Management Events: " + JSON.stringify(evt));
        if (evt.event == "VarSet" && evt.variable) {
          for (let i in evt.variable) {
            if (!vars[i] || vars[i].uniqueid != evt.uniqueid || vars[i].value != evt.value) {
              vars[i] = {
                'uniqueid': evt.uniqueid,
                'value': evt.value
              };
              adapter.log.debug("Variable: " + i + " = " + evt.value);


              if (evt.context == "ael-antwort" && i == 'dtmf') {
                let stateId = 'dialin.dtmf';
                adapter.setState(stateId, evt.value, true);
                /*
                adapter.setState(stateId, '', (err) => {
                  if (!err) adapter.setState(stateId, evt.value, true);
                });
                */
                stateId = 'dialin.callerid';
                adapter.setState(stateId, evt.calleridnum, true);

              }

              if (evt.context == "ael-ansage" && i == 'dtmf') {
                let stateId = 'dialout.dtmf';
                adapter.setState(stateId, evt.value, true);
                /*
                adapter.setState(stateId, '', (err) => {
                  if (!err) adapter.setState(stateId, evt.value, true);
                });
                */
              }

            }
          }
          callback && callback(evt);
        }
      });
    });
  });

}

// *****************************************************************************************************
// Main function
// *****************************************************************************************************
function main() {

  adapter.log.info("Starting Adapter");
  asteriskConnect((err) => {
    if (!err) {
      adapter.log.info("Connected to Asterisk Manager");
      answerCall();

    } else {
      adapter.log.error("Cound not connect to Asterisk Manager");
    }
  });
  asterisk.keepConnected();
  adapter.subscribeStates('*');
  adapter.log.debug("Started function keepConnected()");

}

'use strict';

var utils = require(__dirname + '/lib/utils'); // Get common adapter utils
var dp = require(__dirname + '/lib/datapoints');
var net = require('net');
var adapter = new utils.Adapter('asterisk');
var ami = require(__dirname + '/lib/ami');
var transcode = require(__dirname + '/lib/transcode');
var asterisk = undefined
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
      let tmppath = adapter.config.path || '/tmp/';

      adapter.log.debug('Message: ' + JSON.stringify(msg));

      if (tmppath.slice(-1) != '/' && tmppath.slice(-1) != '\\') {
        tmppath = tmppath + '/';
      }

      if (parameter) {
        if (command == 'dial') {
          adapter.log.debug('Dial Command');
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
                  adapter.sendTo(msg.from, msg.command, { result: res, error: err }, msg.callback);
                });
              })
              .catch((err) => {
                // An error occured
                adapter.log.error('Error while dialing (2). Error: ' + JSON.stringify(err));
                adapter.sendTo(msg.from, msg.command, { result: null, error: err }, msg.callback);
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
                    adapter.sendTo(msg.from, msg.command, { result: res, error: err }, msg.callback);
                  });
                })
                .catch((err) => {
                  // An error occured
                  adapter.log.error('Error while dialing (2). Error: ' + JSON.stringify(err));
                  adapter.sendTo(msg.from, msg.command, { result: null, error: err }, msg.callback);
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
                adapter.sendTo(msg.from, msg.command, { result: res, error: err }, msg.callback);
              });
            } else {
              adapter.log.error('MP3 or GSM audio file is missing');
              adapter.sendTo(msg.from, msg.command, { result: null, error: 'MP3 or GSM audio file is missing' }, msg.callback);
            }
          } else {
            adapter.log.error('Paramter telnr and/or text/audiofile is missing');
            adapter.sendTo(msg.from, msg.command, { result: null, error: 'Paramter telnr and/or text/audiofile is missing' }, msg.callback);
          }
        }

        if (command == 'action') {
          adapter.log.debug('Action Command');
          if (parameter.text) {
            if (!parameter.audiofile) parameter.audiofile = tmppath + 'audio_' + id;
            let language = parameter.language || systemLanguage;
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
                  adapter.sendTo(msg.from, msg.command, { result: res, error: err }, msg.callback);
                });
              })
              .catch((err) => {
                // An error occured
                adapter.log.error('Error while dialing (2). Error: ' + JSON.stringify(err));
                adapter.sendTo(msg.from, msg.command, { result: null, error: err }, msg.callback);
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
              adapter.sendTo(msg.from, msg.command, { result: res, error: err }, msg.callback);
            });
          }
        }

      } else {
        adapter.log.error('Paramter missing');
        adapter.sendTo(msg.from, msg.command, { result: null, error: 'Paramter missing' }, msg.callback);
      }

    } else {
      adapter.log.error('Could not connect to Asterisk');
    }
  });
});


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
    main();
  });
});



function asteriskWaitForConnection(callback, counter = 0) {
  if (!asterisk || counter > 1000) return callback && callback(true);
  if (!asterisk.isConnected()) {
    setTimeout(() => {
      counter++
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
      counter++
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



// *****************************************************************************************************
// Main function
// *****************************************************************************************************
function main() {

  /*
  let converter = new transcode();
  converter.textToMp3New("hallo ein Test", 'DE', 100, '/tmp/test.mp3')
    .then((file) => {
      let a = file;
    })
    .catch((err) => {
      let a = err;
    })
    */

  adapter.log.info("Starting Adapter");
  asteriskConnect((err) => {
    if (!err) {
      adapter.log.info("Connected to Asterisk Manager");
    } else {
      adapter.log.error("Cound not connect to Asterisk Manager");
    }
  });
  asterisk.keepConnected();
  adapter.log.debug("Started function keepConnected()");

}

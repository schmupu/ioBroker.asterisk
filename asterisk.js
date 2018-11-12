'use strict';

var utils = require(__dirname + '/lib/utils'); // Get common adapter utils
var dp = require(__dirname + '/lib/datapoints');
var net = require('net');
var adapter = new utils.Adapter('asterisk');
var ami = require(__dirname + '/lib/ami');
var transcode = require(__dirname + '/lib/transcode');
var asterisk = undefined
var converter = undefined;
var systemLanguage  = 'EN';

// *****************************************************************************************************
// is called when adapter shuts down - callback has to be called under any circumstances!
// *****************************************************************************************************
adapter.on('unload', (callback) => {

  try {
    adapter.log.info('Closing Asterisk Adapter');

    if (server) {
      server.close();
    }

    callback();
  } catch (e) {
    callback();
  }

});


// *****************************************************************************************************
// Listen for sendTo messages
// *****************************************************************************************************
adapter.on('message', (msg) => {

  let command = msg.command;
  let parameter = msg.message;
  let callback = msg.callback;
  let id = msg._id;
  let tmppath = adapter.config.path || '/tmp/';

  adapter.log.debug('Message: ' + JSON.stringify(msg));

  if(tmppath.slice(-1) != '/' && tmppath.slice(-1) != '\\' ) {
    tmppath = tmppath +  '/';
  } 

  if (parameter) {
    if (command == 'dial') {
      if (parameter.text && parameter.telnr) {
        if (!parameter.audiofile) parameter.audiofile =  tmppath + 'audio_' + id ;
        if (converter.getFilenameExtension(parameter.audiofile).toLowerCase() == 'gsm') {
          parameter.audiofile = converter.getBasename(parameter.audiofile);
        }
        let language = parameter.language || systemLanguage;
        adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
        converter.textToGsm(parameter.text, language, 100, parameter.audiofile + '.gsm')
          .then((file) => {
            adapter.log.debug("dial start dialing " + JSON.stringify(file));
            // The file is converted at path "file"
            asterisk.dial(parameter, (err, res) => {
              if (err) {
                adapter.log.error("dial error " + JSON.stringify(err));
              } else {
                adapter.log.debug("dial result " + JSON.stringify(res));
              }
              adapter.sendTo(msg.from, msg.command, { result: res, error: err }, msg.callback);
            });
          })
          .catch((err) => {
            // An error occured
            adapter.log.error("dial error " + JSON.stringify(err));
            adapter.sendTo(msg.from, msg.command, { result: null, error: err }, msg.callback);
          });
      } else if (parameter.audiofile && parameter.telnr) {
        if (converter.getFilenameExtension(parameter.audiofile).toLowerCase() == 'mp3') {
          let fileNameMP3 = parameter.audiofile;
          let fileNameGSM = converter.getBasename(parameter.audiofile) + '.gsm';
          parameter.audiofile = converter.getBasename(parameter.audiofile);
          adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
          converter.mp3ToGsm(fileNameMP3, fileNameGSM, false)
            .then((file) => {
              adapter.log.debug("dial start dialing " + JSON.stringify(file));
              // The file is converted at path "file"
              asterisk.dial(parameter, (err, res) => {
                if (err) {
                  adapter.log.error("dial error " + JSON.stringify(err));
                } else {
                  adapter.log.debug("dial result " + JSON.stringify(res));
                }
                adapter.sendTo(msg.from, msg.command, { result: res, error: err }, msg.callback);
              });
            })
            .catch((err) => {
              // An error occured
              adapter.log.error("dial error " + JSON.stringify(err));
              adapter.sendTo(msg.from, msg.command, { result: null, error: err }, msg.callback);
            });
        } else {
          // play audio file if exist
          parameter.audiofile = converter.getBasename(parameter.audiofile);
          adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
          asterisk.dial(parameter, (err, res) => {
            if (err) {
              adapter.log.error("dial error " + JSON.stringify(err));
            } else {
              adapter.log.debug("dial result " + JSON.stringify(res));
            }
            adapter.sendTo(msg.from, msg.command, { result: res, error: err }, msg.callback);
          });
        }
      } else {
        adapter.log.error('Paramter telnr and/or text/audiofile is missing');
        adapter.sendTo(msg.from, msg.command, { result: null, error: 'Paramter telnr and/or text/audiofile is missing' }, msg.callback);
      }
    }

    if (command == 'action') {
      if (parameter.text) {
        if (!parameter.audiofile) parameter.audiofile = tmppath + 'audio_' + id;
        let language = parameter.language || systemLanguage;
        adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
        converter.textToGsm(parameter.text, language, 100, parameter.audiofile + ".gsm")
          .then((file) => {
            adapter.log.debug("action start acion " + JSON.stringify(file));
            // The file is converted at path "file"
            asterisk.action(parameter, (err, res) => {
              if (err) {
                adapter.log.error("action error " + JSON.stringify(err));
              } else {
                adapter.log.debug("action result " + JSON.stringify(res));
              }
              adapter.sendTo(msg.from, msg.command, { result: res, error: err }, msg.callback);
            });
          })
          .catch((err) => {
            // An error occured
            adapter.log.error("action error " + JSON.stringify(err));
          });
      } else {
        adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
        asterisk.action(parameter, (err, res) => {
          if (err) {
            adapter.log.error("action error " + JSON.stringify(err));
          } else {
            adapter.log.debug("action result " + JSON.stringify(res));
          }
          adapter.sendTo(msg.from, msg.command, { result: res, error: err }, msg.callback);
        });
      }
    }

  } else {
    adapter.log.error('Paramter missing');
    adapter.sendTo(msg.from, msg.command, { result: null, error: 'Paramter missing' }, msg.callback);
  }

});


// *****************************************************************************************************
// is called when databases are connected and adapter received configuration.
// start here!
// *****************************************************************************************************
// adapter.on('ready', () => {

//   adapter.log.info("Adapter " + adapter.namespace + " starting!");
//   main();

// });

adapter.on('ready', () => {
  adapter.getForeignObject('system.config', (err, obj) => {
      systemLanguage = (obj.common.language).toUpperCase();
      main();
  });
});


// *****************************************************************************************************
// Main function
// *****************************************************************************************************
function main() {

  asterisk = new ami(adapter.config.port, adapter.config.ip, adapter.config.user, adapter.config.password, false);
  converter = new transcode();

}
     
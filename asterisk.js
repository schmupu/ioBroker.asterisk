'use strict';

var utils = require(__dirname + '/lib/utils'); // Get common adapter utils
var dp = require(__dirname + '/lib/datapoints');
var net = require('net');
var adapter = new utils.Adapter('asterisk');
var ami = require(__dirname + '/lib/ami');
var transcode = require(__dirname + '/lib/transcode');
var asterisk = undefined
var converter = undefined;

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

  adapter.log.debug('Message: ' + JSON.stringify(msg));

  adapter.sendTo(msg.from, msg.command, {
    result: {
      success: true
    },
    error: null
  }, msg.callback);


  if (parameter) {

    if (command == 'dial') {
      if (parameter.text && parameter.telnr) {
        if (!parameter.audiofile) parameter.audiofile = '/tmp/audio_' + id;
        converter.textToGsm(parameter.text, 'DE', 100, parameter.audiofile + ".gsm")
          .then((file) => {
            adapter.log.debug("dial finish " + JSON.stringify(file));
            // The file is converted at path "file"
            asterisk.dial(parameter, (err, res) => {
              if (err) {
                adapter.log.error("dial error " + JSON.stringify(err));
              } else {
                adapter.log.debug("dial result " + JSON.stringify(res));
              }
            });
          })
          .catch((err) => {
            // An error occured
            aadapter.log.error("dial error " + JSON.stringify(err));
          });
      } else {
        adapter.log.error('Paramter telnr and/or text are missing');
      }
    }

    if (command == 'action') {
      if (parameter.text) {
        if (!parameter.audiofile) parameter.audiofile = '/tmp/audio_' + id;
        converter.textToGsm(parameter.text, 'DE', 100, parameter.audiofile + ".gsm")
          .then((file) => {
            adapter.log.debug("action finish " + JSON.stringify(file));
            // The file is converted at path "file"
            asterisk.action(parameter, (err, res) => {
              if (err) {
                adapter.log.error("action error " + JSON.stringify(err));
              } else {
                adapter.log.debug("action result " + JSON.stringify(res));
              }
            });
          })
          .catch((err) => {
            // An error occured
            adapter.log.error("action error " + JSON.stringify(err));
          });
      } else {
        asterisk.action(parameter, (err, res) => {
          if (err) {
            adapter.log.error("action error " + JSON.stringify(err));
          } else {
            adapter.log.debug("action result " + JSON.stringify(res));
          }
        });
      }
    }

  } else {
    adapter.log.error('Paramter missing');
  }

});


// *****************************************************************************************************
// is called when databases are connected and adapter received configuration.
// start here!
// *****************************************************************************************************
adapter.on('ready', () => {

  adapter.log.info("Adapter " + adapter.namespace + " starting!");
  main();

});


// *****************************************************************************************************
// Main function
// *****************************************************************************************************
function main() {

  asterisk = new ami(adapter.config.port, adapter.config.ip, adapter.config.user, adapter.config.password, false);
  converter = new transcode();

}

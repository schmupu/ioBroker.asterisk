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


adapter.on('message', (msg) => {
  let command = msg.command;
  let parameter = msg.message;
  let id = msg._id;

  adapter.log.debug('Message: ' + JSON.stringify(msg));

  if (command == 'dial') {
    if (parameter && parameter.text && parameter.telnr) {
      if(!parameter.audiofile) parameter.audiofile = '/tmp/audio_' + id;
      converter.textToGsm(parameter.text, 'DE', 100, parameter.audiofile + ".gsm")
        .then((file) => {
          adapter.log.info("finish" + JSON.stringify(file));
          // The file is converted at path "file"
          asterisk.dial(parameter, (err, res) => {
            adapter.log.info(res);
          });
        })
        .catch((err) => {
          // An error occured
          adapter.log.error(err);
        });
    } else {
      adapter.log.error('Paramter telnr and/or text are missing');
    }
  }

});




// *****************************************************************************************************
// is called when databases are connected and adapter received configuration.
// start here!
// *****************************************************************************************************
adapter.on('ready', () => {

  adapter.log.info(adapter.namespace);
  main();

});


// *****************************************************************************************************
// Main function
// *****************************************************************************************************
function main() {

  asterisk = new ami(adapter.config.port, adapter.config.ip, adapter.config.user, adapter.config.password, false);
  converter = new transcode();
 

}



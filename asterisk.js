'use strict';

var utils = require(__dirname + '/lib/utils'); // Get common adapter utils
var dp = require(__dirname + '/lib/datapoints');
var net = require('net');
var adapter = new utils.Adapter('asterisk');

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

}



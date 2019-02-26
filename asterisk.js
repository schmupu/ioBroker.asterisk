/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const utils = require('@iobroker/adapter-core');
const ami = require(__dirname + '/lib/ami');
const transcode = require(__dirname + '/lib/transcode');
const fs = require('fs');
const node_ssh = require('node-ssh');

let asterisk;
let systemLanguage = 'EN';

const adapterName = require('./package.json').name.split('.').pop();
let adapter;

function startAdapter(options) {
  options = options || {};
  options.name = adapterName;
  adapter = new utils.Adapter(options);

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
        let tmppath = adapter.config.path || '/tmp/';
        if (tmppath.slice(-1) != '/' && tmppath.slice(-1) != '\\') {
          tmppath = tmppath + '/';
        }
        let parameter = {
          'audiofile': tmppath + 'asterisk_dtmf',
          'text': state.val
        };
        if (state.val) convertDialInFile(parameter, () => { });
        adapter.setState(stateId, state.val, true);
      }
      if (stateId == 'dialout.call') {
        let parameter = {};
        adapter.getState('dialout.callerid', (err, state) => {
          if (!err && state) {
            parameter.callerid = state.val || '';
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
        });
      }

    }
  });

  // *****************************************************************************************************
  // Listen for sendTo messages
  // *****************************************************************************************************
  adapter.on('message', (msg) => {
    asteriskConnect((err) => {
      if (!err) {
        adapter.log.debug('Connected to Asterisk');
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
      if (adapter.config.sshpassword) {
        if (obj && obj.native && obj.native.secret) {
          //noinspection JSUnresolvedVariable
          adapter.config.sshpassword = decrypt(obj.native.secret, adapter.config.sshpassword);
        } else {
          //noinspection JSUnresolvedVariable
          adapter.config.sshpassword = decrypt('Zgfr56gFe87jJOM', adapter.config.sshpassword);
        }
      }
      if (adapter.config.sippassword) {
        if (obj && obj.native && obj.native.secret) {
          //noinspection JSUnresolvedVariable
          adapter.config.sippassword = decrypt(obj.native.secret, adapter.config.sippassword);
        } else {
          //noinspection JSUnresolvedVariable
          adapter.config.sippassword = decrypt('Zgfr56gFe87jJOM', adapter.config.sippassword);
        }
      }
      if (adapter.config.forceReInit) {
        let configfiles = [
          'pjsip_telekom.conf.template',
          'pjsip_fritzbox.conf.template',
          'pjsip_sipgate.conf.template',
          'sip_fritzbox.conf.template',
          'extensions.ael.template',
          'manager.conf.template',
          'rtp.conf.template'
        ];
        createConfigFile(configfiles, () => {
          adapter.extendForeignObject('system.adapter.' + adapter.namespace, { native: { forceReInit: false } });
        });
      }

      initStates();
      adapter.log.info('Starting Adapter ' + adapter.namespace + ' in version ' + adapter.version + ' with transcoder ' + adapter.config.transcoder + ' and language ' + adapter.config.language);
      main();
    });
  });
  return adapter;
}

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
// OS System Windows
// *****************************************************************************************************
function isWindow() {
  return process.platform.startsWith('win');
}

// *****************************************************************************************************
// Basename
// *****************************************************************************************************
function basename(filename) {
  if (!filename) return filename;
  return filename.replace(/\\/g, '/').replace(/.*\//, '');
  // return filename.split(/[\\/]/).pop() || filename;
}

// *****************************************************************************************************
// Dirname
// *****************************************************************************************************
function dirname(path) {
  if (!path) return path;
  if (path.slice(-1) == '/') {
    return path.slice(0, -1);
  } else {
    return path.replace(/\\/g, '/').replace(/\/[^/]*$/, '');
  }
}


// *****************************************************************************************************
// Add / at the end of the path
// *****************************************************************************************************
function addSlashToPath(path) {
  if (path && path.slice(-1) != '/' && path.slice(-1) != '\\') {
    return path + '/';
  } else {
    return path;
  }
}

// *****************************************************************************************************
// Create Config Files
// *****************************************************************************************************
function createConfigFile(configfiles, callback) {
  let file = configfiles.pop();
  if (file) {
    if ((file.startsWith('pjsip') || file.startsWith('sip')) && !file.startsWith(adapter.config.service)) {
      return createConfigFile(configfiles, callback); // next
    }
    let srcfile = __dirname + '/template/' + file;
    let dstfile = '/tmp/' + file.replace('.template', '');
    fs.readFile(srcfile, 'utf8', (err, contents) => {
      if (!err && contents) {
        let dstcontent = contents;
        if (file.endsWith('pjsip_telekom.conf.template') && adapter.config.sipuser) {
          adapter.config.sipusercountry = '+49' + adapter.config.sipuser.slice(1);
        }
        for (let i in adapter.config) {
          let search = '${' + i + '}';
          let value = adapter.config[i];
          dstcontent = dstcontent.split(search).join(value);
        }
        fs.writeFile(dstfile, dstcontent, (err) => {
          if (err) {
            adapter.log.error('Error creating config file ' + dstfile + ' / ' + err);
            return createConfigFile(configfiles, callback);
          } else {
            if (adapter.config.ssh) {
              adapter.log.info('Transfering Config File: scp ' + dstfile + ' ' + adapter.config.sshuser + '@' + adapter.config.ip + ':' + dstfile);
              sendSSH(dstfile, dstfile)
                .then(() => {
                  // adapter.log.info('scp ' + adapter.config.sshuser + '@' + adapter.config.ip + ':' + dstfile + ' ' + dstfile);
                  adapter.log.info('Create config file ' + dstfile + ' for asterisk. Please move it to /etc/asterisk/ or delete it!');
                  createConfigFile(configfiles, callback);
                })
                .catch((err) => {
                  adapter.log.error('Error tranfering confifile ' + dstfile + ' by scp / ' + err);
                  return createConfigFile(configfiles, callback);
                });
            } else {
              adapter.log.info('Create config file ' + dstfile + ' for asterisk. Please move it to /etc/asterisk/ or delete it!');
              createConfigFile(configfiles, callback);
            }
          }
        });
      } else {
        adapter.log.error('Error reading template file ' + srcfile + ' / ' + err);
      }
    });
  } else {
    callback && callback();
  }
}

// *****************************************************************************************************
// SSH
// *****************************************************************************************************
function sendSSH(srcfile, dstfile) {
  return new Promise((resolve, reject) => {
    let ssh = new node_ssh();
    ssh.connect({
      host: adapter.config.ip,
      username: adapter.config.sshuser,
      port: adapter.config.sshport,
      password: adapter.config.sshpassword,
      tryKeyboard: true,
      onKeyboardInteractive: (name, instructions, instructionsLang, prompts, finish) => {
        if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
          finish([adapter.config.sshpassword]);
        }
      }
    })
      .then(() => {
        adapter.log.info('scp ' + srcfile + ' ' + adapter.config.sshuser + '@' + adapter.config.ip + ':' + dstfile);
        ssh.putFile(srcfile, dstfile)
          .then(() => {
            adapter.log.debug('Transfer of file with scp ' + srcfile + ' is done');
            // deleting src file. Will not be needed anymore after tranfering
            fs.unlink(srcfile, (err) => {
              if (!err) {
                adapter.log.debug('Deleting file : ' + srcfile);
              } else {
                adapter.log.error('Error deleting srcfile ' + srcfile + ' : ' + err);
              }
            });
            resolve('Transfer of file with scp ' + srcfile + ' is done');
          })
          .catch((err) => {
            adapter.log.error('scp transfer error: ' + err);
            reject(err);
          });
      })
      .catch((err) => {
        // An error occured
        adapter.log.error('Error with scp connection: ' + JSON.stringify(err));
        reject(err);
      });
  });
}

// *****************************************************************************************************
// Dial
// *****************************************************************************************************
function dial(command, parameter, msgid, callback) {

  let id = msgid;
  let tmppath;
  let converter = new transcode(adapter.config.transcoder);

  if (!adapter.config.ssh) {
    tmppath = addSlashToPath(adapter.config.path || '/tmp/');
  } else {
    // if ssh, save files local in /tmp directory
    tmppath = addSlashToPath('/tmp/');
  }

  adapter.log.debug('Message: ' + JSON.stringify(parameter));

  if (parameter) {
    if (command == 'dial') {
      adapter.log.debug('Dial Command');

      if (!parameter.extension) parameter.extension = adapter.config.sipuser;
      if (parameter.telnr) { adapter.setState('dialout.telnr', parameter.telnr, true); }
      if (parameter.text) { adapter.setState('dialout.text', parameter.text, true); }
      if (parameter.callerid) { adapter.setState('dialout.callerid', parameter.callerid, true); }


      if (parameter.text && parameter.telnr) {
        if (!parameter.audiofile) parameter.audiofile = tmppath + 'audio_' + id;
        if (converter.getFilenameExtension(parameter.audiofile).toLowerCase() == 'gsm') {
          parameter.audiofile = converter.getBasename(parameter.audiofile);
        }
        let language = parameter.language || adapter.config.language || systemLanguage;
        adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
        adapter.log.debug('Start converting text message (' + parameter.text + ') to GSM audio ‚file ' + parameter.audiofile);
        converter.textToGsm(parameter.text, language, 100, parameter.audiofile + '.gsm')
          .then((file) => {
            adapter.log.debug('Converting completed. Result: ' + JSON.stringify(file));
            // The file is converted at path 'file'
            if (adapter.config.ssh) {
              adapter.log.debug('Start scp transfer');
              let srcfile = parameter.audiofile + '.gsm';
              let dstfile = adapter.config.path + '/' + basename(srcfile);
              parameter.audiofile = converter.getBasename(dstfile);
              sendSSH(srcfile, dstfile)
                .then(() => {
                  adapter.log.info('Start dialing');
                  asterisk.dial(parameter, (err, res) => {
                    if (err) {
                      adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
                    } else {
                      adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
                    }
                    adapter.log.debug('Calling callback function: ' + callback);
                    callback && callback(res, err);
                  });
                })
                .catch((err) => {
                  callback && callback(null, err);
                });
            } else {
              adapter.log.info('Start dialing');
              asterisk.dial(parameter, (err, res) => {
                if (err) {
                  adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
                } else {
                  adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
                }
                adapter.log.debug('Calling callback function: ' + callback);
                callback && callback(res, err);
              });
            }
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
          if (adapter.config.transcoder == 'sox') {
            converter.mp3ToGsmSox(fileNameMP3, fileNameGSM, false)
              .then((file) => {
                // The file is converted at path 'file'
                if (adapter.config.ssh) {
                  adapter.log.debug('Start scp transfer');
                  let srcfile = parameter.audiofile + '.gsm';
                  let dstfile = adapter.config.path + '/' + basename(srcfile);
                  parameter.audiofile = converter.getBasename(dstfile);
                  sendSSH(srcfile, dstfile)
                    .then(() => {
                      adapter.log.info('Start dialing');
                      asterisk.dial(parameter, (err, res) => {
                        if (err) {
                          adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
                        } else {
                          adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
                        }
                        adapter.log.debug('Calling callback function: ' + callback);
                        callback && callback(res, err);
                      });
                    })
                    .catch((err) => {
                      callback && callback(null, err);
                    });
                } else {
                  asterisk.dial(parameter, (err, res) => {
                    if (err) {
                      adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
                    } else {
                      adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
                    }
                    adapter.log.debug('Calling callback function: ' + callback);
                    callback && callback(res, err);
                  });
                }
              })
              .catch((err) => {
                // An error occured
                adapter.log.error('Error while dialing (2). Error: ' + JSON.stringify(err));
                callback && callback(null, err);
              });
          } else {
            converter.mp3ToGsmFfmpeg(fileNameMP3, fileNameGSM, false)
              .then((file) => {
                // The file is converted at path 'file'
                if (adapter.config.ssh) {
                  adapter.log.debug('Start scp transfer');
                  let srcfile = parameter.audiofile + '.gsm';
                  let dstfile = adapter.config.path + '/' + basename(srcfile);
                  parameter.audiofile = converter.getBasename(dstfile);
                  sendSSH(srcfile, dstfile)
                    .then(() => {
                      adapter.log.info('Start dialing');
                      asterisk.dial(parameter, (err, res) => {
                        if (err) {
                          adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
                        } else {
                          adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
                        }
                        adapter.log.debug('Calling callback function: ' + callback);
                        callback && callback(res, err);
                      });
                    })
                    .catch((err) => {
                      callback && callback(null, err);
                    });
                } else {
                  adapter.log.info('Start dialing');
                  asterisk.dial(parameter, (err, res) => {
                    if (err) {
                      adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
                    } else {
                      adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
                    }
                    adapter.log.debug('Calling callback function: ' + callback);
                    callback && callback(res, err);
                  });
                }
              })
              .catch((err) => {
                // An error occured
                adapter.log.error('Error while dialing (2). Error: ' + JSON.stringify(err));
                callback && callback(null, err);
              });
          }
        } else if (converter.getFilenameExtension(parameter.audiofile).toLowerCase() == 'gsm') {
          // play audio file if exist
          let fileNameGSM = converter.getBasename(parameter.audiofile) + '.gsm';
          parameter.audiofile = converter.getBasename(parameter.audiofile);
          adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
          adapter.log.debug('Got GSM audio file ' + fileNameGSM);
          if (adapter.config.ssh) {
            adapter.log.debug('Start scp transfer');
            let srcfile = parameter.audiofile + '.gsm';
            let dstfile = adapter.config.path + '/' + basename(srcfile);
            parameter.audiofile = converter.getBasename(dstfile);
            sendSSH(srcfile, dstfile)
              .then(() => {
                adapter.log.info('Start dialing');
                asterisk.dial(parameter, (err, res) => {
                  if (err) {
                    adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
                  } else {
                    adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
                  }
                  adapter.log.debug('Calling callback function: ' + callback);
                  callback && callback(res, err);
                });
              })
              .catch((err) => {
                callback && callback(null, err);
              });
          } else {
            adapter.log.info('Start dialing');
            asterisk.dial(parameter, (err, res) => {
              if (err) {
                adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
              } else {
                adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
              }
              adapter.log.debug('Calling callback function: ' + callback);
              callback && callback(res, err);
            });
          }
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
        let language = parameter.language || adapter.config.language || systemLanguage;
        if (!parameter.extension) parameter.extension = adapter.config.sipuser;
        adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
        adapter.log.debug('Start converting text message (' + parameter.text + ') to GSM audio ‚file ' + parameter.audiofile);
        converter.textToGsm(parameter.text, language, 100, parameter.audiofile + '.gsm')
          .then((file) => {
            // The file is converted at path 'file'
            adapter.log.debug('Start Action');
            if (adapter.config.ssh) {
              adapter.log.debug('Start scp transfer');
              let srcfile = parameter.audiofile + '.gsm';
              let dstfile = adapter.config.path + '/' + basename(srcfile);
              parameter.audiofile = converter.getBasename(dstfile);
              sendSSH(srcfile, dstfile)
                .then(() => {
                  adapter.log.info('Start dialing');
                  asterisk.dial(parameter, (err, res) => {
                    if (err) {
                      adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
                    } else {
                      adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
                    }
                    adapter.log.debug('Calling callback function: ' + callback);
                    callback && callback(res, err);
                  });
                })
                .catch((err) => {
                  callback && callback(null, err);
                });
            } else {
              adapter.log.info('Start dialing');
              asterisk.dial(parameter, (err, res) => {
                if (err) {
                  adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
                } else {
                  adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
                }
                adapter.log.debug('Calling callback function: ' + callback);
                callback && callback(res, err);
              });
            }
          })
          .catch((err) => {
            // An error occured
            adapter.log.error('Error while dialing (2). Error: ' + JSON.stringify(err));
            callback && callback(null, err);
          });
      } else {
        adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
        adapter.log.debug('Start Action');
        if (adapter.config.ssh) {
          adapter.log.debug('Start scp transfer');
          let srcfile = parameter.audiofile + '.gsm';
          let dstfile = adapter.config.path + '/' + basename(srcfile);
          parameter.audiofile = converter.getBasename(dstfile);
          sendSSH(srcfile, dstfile)
            .then(() => {
              adapter.log.info('Start dialing');
              asterisk.dial(parameter, (err, res) => {
                if (err) {
                  adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
                } else {
                  adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
                }
                adapter.log.debug('Calling callback function: ' + callback);
                callback && callback(res, err);
              });
            })
            .catch((err) => {
              callback && callback(null, err);
            });
        } else {
          adapter.log.info('Start dialing');
          asterisk.dial(parameter, (err, res) => {
            if (err) {
              adapter.log.error('Error while dialing (1). Error: ' + JSON.stringify(err) + ', Result: ' + JSON.stringify(res));
            } else {
              adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
            }
            adapter.log.debug('Calling callback function: ' + callback);
            callback && callback(res, err);
          });
        }
      }
    }

  } else {
    adapter.log.error('Paramter missing');
    callback && callback(null, 'Paramter missing');
  }

}


function initStates() {

  adapter.getState('dialin.text', (err, state) => {
    if (!err && state && !state.val) adapter.setState('dialin.text', 'Please enter after the beep tone your passwort and press hashtag.', true);
  });
  adapter.setState('dialin.dtmf', '', true);
  adapter.setState('dialin.callerid', '', true);

  adapter.getState('dialout.text', (err, state) => {
    if (!err && state && !state.val) adapter.setState('dialout.text', 'ioBroker is calling you. Please call me back', true);
  });
  /*
  adapter.setState('dialout.telnr', '', true);
  adapter.setState('dialout.dtmf', '', true);
  adapter.setState('dialout.callerid', '', true);
  */
}


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
    asterisk = new ami({
      'port': adapter.config.port,
      'hostname': adapter.config.ip,
      'username': adapter.config.user,
      'password': adapter.config.password,
      'service': adapter.config.service
    });
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

  let converter = new transcode(adapter.config.transcoder);
  let language = parameter.language || adapter.config.language || systemLanguage;
  let tmpfile;

  if (!adapter.config.ssh) {
    tmpfile = parameter.audiofile || '/tmp/asterisk_dtmf';
  } else {
    // if ssh, save files local in /tmp directory
    tmpfile = '/tmp/asterisk_dtmf';
  }

  parameter.text = parameter.text || 'Please enter after the beep tone your passwort and press hashtag.';
  converter.textToGsm(parameter.text, language, 100, tmpfile + '.gsm')
    .then((file) => {
      adapter.log.debug('Converting completed. Result: ' + JSON.stringify(file));
      if (adapter.config.ssh) {
        adapter.log.debug('Start scp transfer');
        let srcfile = tmpfile + '.gsm';
        let dstfile = parameter.audiofile + '.gsm';
        sendSSH(srcfile, dstfile)
          .then(() => {
            adapter.log.debug('Listing vor Dial In Event after scp');
            callback && callback();
          })
          .catch((err) => {
            adapter.log.error('scp tranfer error: ' + err);
            callback && callback(null, err);
          });
      } else {
        adapter.log.debug('Listing vor Dial In Event');
        callback && callback();
      }
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

    let tmppath = adapter.config.path || '/tmp/';
    if (tmppath.slice(-1) != '/' && tmppath.slice(-1) != '\\') {
      tmppath = tmppath + '/';
    }

    parameter.language = adapter.config.language || systemLanguage;
    parameter.audiofile = parameter.audiofile || tmppath + 'asterisk_dtmf';
    parameter.text = !err && state && state.val ? state.val : 'Please enter after the beep tone your passwort and press hashtag!';

    convertDialInFile(parameter, () => {

      asterisk.asteriskEvent('managerevent', (evt) => {
        adapter.log.debug('Management Events: ' + JSON.stringify(evt));
        if (evt.event == 'VarSet' && evt.variable) {
          for (let i in evt.variable) {
            if (!vars[i] || vars[i].uniqueid != evt.uniqueid || vars[i].value != evt.value) {
              vars[i] = {
                'uniqueid': evt.uniqueid,
                'value': evt.value
              };
              adapter.log.debug('Variable: ' + i + ' = ' + evt.value);

              if (evt.context == 'ael-antwort' && i == 'dtmf') {
                let stateId;
                stateId = 'dialin.callerid';
                adapter.setState(stateId, evt.calleridnum, true);
                stateId = 'dialin.dtmf';
                adapter.setState(stateId, evt.value, true);
              }

              if (evt.context == 'ael-ansage' && i == 'dtmf') {
                let stateId = 'dialout.dtmf';
                adapter.setState(stateId, evt.value, true);
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
  asteriskConnect((err) => {
    if (!err) {
      adapter.log.info('Connected to Asterisk Manager');
      asterisk.keepConnected();
      adapter.subscribeStates('*');
      answerCall();
    } else {
      let wait = 30;
      adapter.log.error('Cound not connect to Asterisk Manager! Try to connect in ' + wait + ' seconds again!');
      setTimeout(() => {
        main();
      }, wait * 1000);
    }
  });
}


// If started as allInOne mode => return function to create instance
if (typeof module !== 'undefined' && module.parent) {
  module.exports = startAdapter;
} else {
  // or start the instance directly
  startAdapter();
}
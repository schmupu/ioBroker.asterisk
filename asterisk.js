'use strict';

const utils = require('@iobroker/adapter-core');
const ami = require(__dirname + '/lib/ami');
const transcode = require(__dirname + '/lib/transcode');
const fs = require('fs');
const node_ssh = require('node-ssh');
const semver = require('semver');

let asterisk;
let systemLanguage = 'EN';

const adapterName = require('./package.json').name.split('.').pop();
const adapterNodeVer = require('./package.json').engines.node;
let adapter;

/**
 * start ioBroker Adapter
 * @param {object} options - parameter for starting adapter
 */
function startAdapter(options) {
  options = options || {};
  options.name = adapterName;
  adapter = new utils.Adapter(options);

  /**
   * is called when adapter shuts down - callback has to be called under any circumstances!
   */
  adapter.on('unload', (callback) => {
    try {
      callback();
    } catch (e) {
      callback();
    }
  });

  /**
   * is called when state changed
   */
  adapter.on('stateChange', async (id, state) => {
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
        try {
          if (state.val) await convertDialInFile(parameter);
          await adapter.setStateAsync(stateId, state.val, true);
        } catch (error) {
          adapter.log.error(error);
        }
      }
      if (stateId == 'dialout.call') {
        try {
          let parameter = {};
          let state;
          state = await adapter.getStateAsync('dialout.callerid');
          parameter.callerid = state.val || '';
          state = await adapter.getStateAsync('dialout.telnr');
          parameter.telnr = state.val;
          state = await adapter.getStateAsync('dialout.text');
          parameter.text = state.val;
          let res = await dial(parameter, state.ts);
          adapter.log.info('Dialing result: ' + JSON.stringify(res));
        } catch (error) {
          adapter.log.error('Error in funkction stateChange: ' + JSON.stringify(error));
        }
      }
    }
  });

  /**
   * Listen for sendTo messages
   */
  adapter.on('message', async (msg) => {
    try {
      let res;
      switch (msg.command) {
        case 'dial':
          res = await dial(msg.message, msg._id);
          await adapter.sendToAsync(msg.from, msg.command, { result: res, error: null });
          msg.callback && msg.callback();
          break;
        case 'action':
          res = await action(msg.message, msg._id);
          await adapter.sendToAsync(msg.from, msg.command, { result: res, error: null });
          msg.callback && msg.callback();
          break;
        default:
          break;
      }
    } catch (error) {
      adapter.log.error('Error while dialing' + error);
      adapter.sendTo(msg.from, msg.command, { result: null, error: error }, msg.callback);
    }
  });


  /**
   * is called when databases are connected and adapter received configuration.
   * start here!
   */
  adapter.on('ready', () => {
    adapter.log.info('Starting Adapter ' + adapter.namespace + ' in version ' + adapter.version);
    if (!semver.satisfies(process.version, adapterNodeVer)) {
      adapter.log.error(`Required node version ${adapterNodeVer} not satisfied with current version ${process.version}.`);
      return;
    }
    (async () => {
      try {
        let obj = await adapter.getForeignObjectAsync('system.config');
        if (obj && obj.common && obj.common.language) systemLanguage = (obj.common.language).toUpperCase();
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
          await createConfigFile();
          await adapter.extendForeignObjectAsync('system.adapter.' + adapter.namespace, { native: { forceReInit: false } });
        }
        await initStates();
        adapter.log.info('Starting Adapter ' + adapter.namespace + ' in version ' + adapter.version + ' with transcoder ' + adapter.config.transcoder + ' and language ' + adapter.config.language);
        await main();
      } catch (error) {
        adapter.log.error(error);
      }
    })();
  });

  return adapter;
}

/**
 * Decrypt Password
 * @param {string} key - decyrpting key
 * @param {string} value - text to decrypt
 */
function decrypt(key, value) {
  let result = '';
  for (let i = 0; i < value.length; ++i) {
    result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
  }
  return result;
}

/**
 * OS System Windows
 */
function isWindow() {
  return process.platform.startsWith('win');
}

/**
 * Basename
 * @param {string} filename - filename
 */
function basename(filename) {
  if (!filename) return filename;
  return filename.replace(/\\/g, '/').replace(/.*\//, '');
  // return filename.split(/[\\/]/).pop() || filename;
}

/**
 * returns the path without / at the end
 * @param {string} path - path like /tmp/ or /huhu/tmp 
 */
function dirname(path) {
  if (!path) return path;
  if (path.slice(-1) == '/') {
    return path.slice(0, -1);
  } else {
    return path.replace(/\\/g, '/').replace(/\/[^/]*$/, '');
  }
}

/**
 * Adds / at the end of the path
 * @param {string} path - path like /tmp or /tmp/ 
 */
function addSlashToPath(path) {
  if (path && path.slice(-1) != '/' && path.slice(-1) != '\\') {
    return path + '/';
  } else {
    return path;
  }
}


/**
 * Create Config Files
 */
async function createConfigFile() {
  let configfiles = [
    'pjsip_telekom.conf.template',
    'pjsip_fritzbox.conf.template',
    'pjsip_sipgate.conf.template',
    'sip_fritzbox.conf.template',
    'extensions.ael.template',
    'manager.conf.template',
    'rtp.conf.template'
  ];
  for (let file of configfiles) {
    if ((file.startsWith('pjsip') || file.startsWith('sip')) && !file.startsWith(adapter.config.service)) {
      continue;
    }
    let srcfile = __dirname + '/template/' + file;
    let dstfile = '/tmp/' + file.replace('.template', '');
    let contents = await readFile(srcfile, 'utf8');
    let dstcontent = contents;
    if (file.endsWith('pjsip_telekom.conf.template') && adapter.config.sipuser) {
      adapter.config.sipusercountry = '+49' + adapter.config.sipuser.slice(1);
    }
    for (let i in adapter.config) {
      let search = '${' + i + '}';
      let value = adapter.config[i];
      dstcontent = dstcontent.split(search).join(value);
    }
    try {
      await writeFile(dstfile, dstcontent);
    } catch (error) {
      // adapter.log.error('Could not write config file ' + dstfile);
      throw new Error('Could not write config file ' + dstfile);
    }
    if (adapter.config.ssh) {
      try {
        await sendSSH(dstfile, dstfile);
        adapter.log.info('Transfering config file: scp ' + dstfile + ' ' + adapter.config.sshuser + '@' + adapter.config.ip + ':' + dstfile);
      } catch (error) {
        // adapter.log.error('Could not copy config files via scp: scp ' + dstfile + ' ' + adapter.config.sshuser + '@' + adapter.config.ip + ':' + dstfile);
        throw new Error('Could not copy config files via scp: scp ' + dstfile + ' ' + adapter.config.sshuser + '@' + adapter.config.ip + ':' + dstfile);
      }
    }
    adapter.log.info('Create config file ' + dstfile + ' for asterisk. Please move it to /etc/asterisk/ or delete it!');
  }
}

/**
 * delete file in filesystem
 * @param {string} file - filenmae 
 */
async function unlink(file) {
  return new Promise((resolve, reject) => {
    fs.unlink(file, (err) => {
      if (!err) {
        adapter.log.debug('Deleting file : ' + file);
        resolve();
      } else {
        adapter.log.debug('Error deleting srcfile ' + file + ' : ' + err);
        reject('Error deleting srcfile ' + file + ' : ' + err);
      }
    });
  });
}

/**
 * save content to file
 * @param {string} file - filename 
 * @param {string} content - content to save
 */
async function writeFile(file, content) {
  return new Promise((resolve, reject) => {
    fs.writeFile(file, content, (err) => {
      if (!err) {
        resolve();
      } else {
        // adapter.log.error('Error creating config file ' + dstfile + ' / ' + err);
        reject(err);
      }
    });
  });
}

/**
 * read file from Filesystem
 * @param {string} file - filename
 * @param {string} options - options like encoding
 */
async function readFile(file, options) {
  return new Promise((resolve, reject) => {
    fs.readFile(file, options, (err, content) => {
      if (!err) {
        resolve(content);
      } else {
        // adapter.log.error('Error creating config file ' + dstfile + ' / ' + err);
        reject(err);
      }
    });
  });
}

/**
 * SSH
 * @param {string} srcfile - source filename (local computer)
 * @param {strng} dstfile - destination filename (destination computer)
 */
async function sendSSH(srcfile, dstfile) {
  let ssh = new node_ssh();
  try {
    await ssh.connect({
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
    });
  } catch (err) {
    adapter.log.debug('Error with scp connection: ' + JSON.stringify(err));
    throw new Error('Error with scp connection: ' + JSON.stringify(err));
  }
  try {
    adapter.log.info('scp ' + srcfile + ' ' + adapter.config.sshuser + '@' + adapter.config.ip + ':' + dstfile);
    await ssh.putFile(srcfile, dstfile);
    await ssh.dispose();
    await unlink(srcfile);
  } catch (err) {
    adapter.log.debug('scp transfer error: ' + err);
    throw new Error(err);
  }
}

/**
 * 
 * @param {object} parameter - parmater for asterisk dialing
 */
async function asteriskDial(parameter) {
  let result = {};
  try {
    if (!asterisk) throw new Error('Not connected to Aterisk');
    result = await asterisk.dial(parameter);
    adapter.log.debug('Dialing completed. Result: ' + JSON.stringify(result));
    return result;
  } catch (error) {
    adapter.log.error('Error while dialing Error: ' + JSON.stringify(error) + ', Result: ' + JSON.stringify(result));
    throw new Error(error);
  }
}


/**
 * Dialing with paramter
 * @param {object} parameter - parameters for dialing
 * @param {string} msgid - msgid
 */
async function action(parameter, msgid) {
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
    adapter.log.debug('Action Command');
    if (parameter.text) {
      if (!parameter.audiofile) parameter.audiofile = tmppath + 'audio_' + id;
      let language = parameter.language || adapter.config.language || systemLanguage;
      if (!parameter.extension) parameter.extension = adapter.config.sipuser;
      adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
      adapter.log.debug('Start converting text message (' + parameter.text + ') to GSM audio ‚file ' + parameter.audiofile);
      let file;
      try {
        file = await converter.textToGsm(parameter.text, language, 100, parameter.audiofile + '.gsm');
      } catch (err) {
        adapter.log.error('Error while dialing. Error: ' + JSON.stringify(err));
        throw new Error(err);
      }
      if (file) {
        adapter.log.debug('Converting completed. Result: ' + JSON.stringify(file));
        // The file is converted at path 'file'
        if (adapter.config.ssh) {
          adapter.log.debug('Start scp transfer');
          let srcfile = parameter.audiofile + '.gsm';
          let dstfile = adapter.config.path + '/' + basename(srcfile);
          parameter.audiofile = converter.getBasename(dstfile);
          try {
            await sendSSH(srcfile, dstfile);
            adapter.log.debug('Start Action');
            let res = await asteriskDial(parameter);
            adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
          } catch (err) {
            adapter.log.error('Error while dialing. SSH Error: ' + JSON.stringify(err));
            throw new Error(err);
          }
        } else {
          try {
            adapter.log.debug('Start Action');
            let res = await asteriskDial(parameter);
            adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
          } catch (err) {
            adapter.log.error('Error while dialing:' + JSON.stringify(err));
            throw new Error(err);
          }
        }
      }
    } else {
      try {
        adapter.log.info('Start dialing');
        let res = await asteriskDial(parameter);
        adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
      } catch (err) {
        adapter.log.error('Error while dialing:' + JSON.stringify(err));
        throw new Error(err);
      }
    }
  }
}

/**
 * Dial
 * @param {object} parameter - paramter for dialing 
 * @param {string} msgid - id
 */
async function dial(parameter, msgid) {
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
    adapter.log.debug('Dial Command');
    if (!parameter.extension) parameter.extension = adapter.config.sipuser;
    if (parameter.telnr) { await adapter.setStateAsync('dialout.telnr', parameter.telnr, true); }
    if (parameter.text) { await adapter.setStateAsync('dialout.text', parameter.text, true); }
    if (parameter.callerid) { await adapter.setStateAsync('dialout.callerid', parameter.callerid, true); }

    if (parameter.text && parameter.telnr) {
      if (!parameter.audiofile) parameter.audiofile = tmppath + 'audio_' + id;
      if (converter.getFilenameExtension(parameter.audiofile).toLowerCase() == 'gsm') {
        parameter.audiofile = converter.getBasename(parameter.audiofile);
      }
      if (!parameter.delete) { parameter.delete = 'delete'; } // delete file after dialing
      let language = parameter.language || adapter.config.language || systemLanguage;
      adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
      adapter.log.debug('Start converting text message (' + parameter.text + ') to GSM audio ‚file ' + parameter.audiofile);
      let file;
      try {
        file = await converter.textToGsm(parameter.text, language, 100, parameter.audiofile + '.gsm');
      } catch (err) {
        adapter.log.error('Error while dialing. Error: ' + JSON.stringify(err));
        throw new Error(err);
      }
      if (file) {
        adapter.log.debug('Converting completed. Result: ' + JSON.stringify(file));
        // The file is converted at path 'file'
        if (adapter.config.ssh) {
          adapter.log.debug('Start scp transfer');
          let srcfile = parameter.audiofile + '.gsm';
          let dstfile = adapter.config.path + '/' + basename(srcfile);
          parameter.audiofile = converter.getBasename(dstfile);
          try {
            await sendSSH(srcfile, dstfile);
            adapter.log.info('Start dialing');
            let res = await asteriskDial(parameter);
            adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
          } catch (err) {
            adapter.log.error('Error while dialing. SSH Error: ' + JSON.stringify(err));
            throw new Error(err);
          }
        } else {
          try {
            adapter.log.info('Start dialing');
            let res = await asteriskDial(parameter);
            adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
          } catch (err) {
            adapter.log.error('Error while dialing. ' + JSON.stringify(err));
            throw new Error(err);
          }
        }
      }
    } else if (parameter.audiofile && parameter.telnr) {
      if (converter.getFilenameExtension(parameter.audiofile).toLowerCase() == 'mp3') {
        let fileNameMP3 = parameter.audiofile;
        let fileNameGSM = converter.getBasename(parameter.audiofile) + '.gsm';
        parameter.audiofile = converter.getBasename(parameter.audiofile);
        if (!parameter.delete) { parameter.delete = ''; } // no delting of the file after dialing
        adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
        adapter.log.debug('Start converting MP3 audio file ' + fileNameMP3 + ' to GSM audio file ' + fileNameGSM);
        try {
          if (adapter.config.transcoder == 'sox') {
            await converter.mp3ToGsmSox(fileNameMP3, fileNameGSM, false);
          } else {
            await converter.mp3ToGsmFfmpeg(fileNameMP3, fileNameGSM, false);
          }
        } catch (err) {
          adapter.log.error('Error converting Gsm to Sox: ' + JSON.stringify(err));
          throw new Error(err);
        }
      } else if (converter.getFilenameExtension(parameter.audiofile).toLowerCase() == 'gsm') {
        let fileNameGSM = converter.getBasename(parameter.audiofile) + '.gsm';
        parameter.audiofile = converter.getBasename(parameter.audiofile);
        adapter.log.debug('Parameter: ' + JSON.stringify(parameter));
        adapter.log.debug('Got GSM audio file ' + fileNameGSM);
      } else {
        adapter.log.error('MP3 or GSM audio file is missing');
        throw new Error('MP3 or GSM audio file is missing');
      }
      // The file is converted at path 'file'
      if (adapter.config.ssh) {
        adapter.log.debug('Start scp transfer');
        let srcfile = parameter.audiofile + '.gsm';
        let dstfile = adapter.config.path + '/' + basename(srcfile);
        parameter.audiofile = converter.getBasename(dstfile);
        try {
          await sendSSH(srcfile, dstfile);
          adapter.log.info('Start dialing');
        } catch (err) {
          adapter.log.error('Error with scp: ' + JSON.stringify(err));
          throw new Error(err);
        }
      }
      try {
        let res = asteriskDial(parameter);
        adapter.log.info('Dialing completed. Result: ' + JSON.stringify(res));
      } catch (err) {
        adapter.log.error('Error while dialing. ' + JSON.stringify(err));
        throw new Error(err);
      }
    } else {
      adapter.log.error('Paramter telnr and/or audiofile is missing');
      throw new Error('Paramter telnr and/or audiofile is missing');
    }
  } else {
    adapter.log.error('Paramter missing');
    throw new Error('Paramter missing');
  }
}


/**
 * Init states
 */
async function initStates() {
  try {
    let state;
    state = await adapter.getStateAsync('dialin.text');
    if (state && !state.val) await adapter.setStateAsync('dialin.text', 'Please enter after the beep tone your passwort and press hashtag.', true);
    await adapter.setStateAsync('dialin.dtmf', '', true);
    await adapter.setStateAsync('dialin.callerid', '', true);
    await adapter.getStateAsync('dialout.text');
    if (state && !state.val) await adapter.setStateAsync('dialout.text', 'ioBroker is calling you. Please call me back', true);
  } catch (error) {
    adapter.log.error('Error in function initStates()');
  }
}

/**
 * sleep / wait
 * @param {number} ms : wait ms miliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Asterisk connection
 * @param {number} counter - try x times to get a connection to asterisk
 */
async function asteriskWaitForConnection(counter = 0) {
  try {
    if (!asterisk || counter > 1000) return false;
    if (!asterisk.isConnected()) {
      counter++;
      await sleep(5);
      return await asteriskWaitForConnection(counter);
    } else {
      await checkManagerConnectionAsync();
      return true;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Disconnect to asterisk server
 * @param {number} counter - try x times to disconnect to asterisk server
 */
async function asteriskWaitForDisonnection(counter = 0) {
  try {
    if (!asterisk || counter > 1000) return false;
    if (asterisk.isConnected()) {
      counter++;
      return await asteriskWaitForDisonnection(counter);
    } else {
      return true;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Wait for Manager connections
 */
async function checkManagerConnectionAsync() {
  return new Promise((resolve, reject) => {
    let wait = 10;
    let timer = setTimeout(() => {
      adapter.log.error('Could not connect to Asterisk manager. Username, password, hostname missing or wrong!');
      reject('Could not connect to Asterisk manager. Username, password, hostname missing or wrong!');
    }, wait * 1000);
    asterisk.asteriskEvent('managerevent', async (evt) => {
      if (evt.event === 'SuccessfulAuth') {
        clearTimeout(timer);
        adapter.log.debug('Connected to Asterisk Manager!');
        resolve();
      }
    });
  });
}

/**
 * Connect to asterisk server
 */
async function asteriskConnect() {
  if (!asterisk) {
    asterisk = await new ami({
      'port': adapter.config.port,
      'hostname': adapter.config.ip,
      'username': adapter.config.user,
      'password': adapter.config.password,
      'service': adapter.config.service
    });
  } else {
    await asterisk.reconnect();
  }
  return await asteriskWaitForConnection();
}

/**
 * Disconnect to asteriks
 */
async function asteriskDisconnect() {
  if (asterisk && asterisk.isConnected()) {
    await asterisk.disconnect();
  }
  return await asteriskWaitForDisonnection();
}

/**
 * Text message to gsm audio file
 * @param {object} parameter - parameter
 */
async function convertDialInFile(parameter) {
  let converter = new transcode(adapter.config.transcoder);
  let language = parameter.language || adapter.config.language || systemLanguage;
  let tmpfile;
  let file;
  if (!adapter.config.ssh) {
    tmpfile = parameter.audiofile || '/tmp/asterisk_dtmf';
  } else {
    tmpfile = '/tmp/asterisk_dtmf';   // if ssh, save files local in /tmp directory
  }
  parameter.text = parameter.text || 'Please enter after the beep tone your passwort and press hashtag.';
  try {
    file = await converter.textToGsm(parameter.text, language, 100, tmpfile + '.gsm');
    adapter.log.debug('Converting completed. Result: ' + JSON.stringify(file));
  } catch (err) {
    // An error occured
    adapter.log.error('Error while converting text "' + parameter.text + '" to file ' + tmpfile + ' (' + err + ')');
    throw new Error(err);
  }
  if (adapter.config.ssh) {
    adapter.log.debug('Start scp transfer');
    let srcfile = tmpfile + '.gsm';
    let dstfile = parameter.audiofile + '.gsm';
    try {
      await sendSSH(srcfile, dstfile);
    } catch (err) {
      adapter.log.debug('scp tranfer error: ' + JSON.stringify(err));
      throw new Error('scp tranfer error: ' + JSON.stringify(err));
    }
  } else {
    adapter.log.debug('Listing vor Dial In Event');
  }
}

/**
 * answer to call
 */
async function answerCall() {
  let parameter = {};
  let vars = {};
  try {
    let state = await adapter.getStateAsync('dialin.text');
    let tmppath = adapter.config.path || '/tmp/';
    if (tmppath.slice(-1) != '/' && tmppath.slice(-1) != '\\') {
      tmppath = tmppath + '/';
    }
    parameter.language = adapter.config.language || systemLanguage;
    parameter.audiofile = parameter.audiofile || tmppath + 'asterisk_dtmf';
    parameter.text = state && state.val ? state.val : 'Please enter after the beep tone your passwort and press hashtag!';
    await convertDialInFile(parameter);
  } catch (error) {
    adapter.log.error(error);
  }
  asterisk.asteriskEvent('managerevent', async (evt) => {
    try {
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
              await adapter.setStateAsync(stateId, evt.calleridnum, true);
              stateId = 'dialin.dtmf';
              await adapter.setStateAsync(stateId, evt.value, true);
            }

            if (evt.context == 'ael-ansage' && i == 'dtmf') {
              let stateId = 'dialout.dtmf';
              await adapter.setStateAsync(stateId, evt.value, true);
            }

          }
        }
      }
    } catch (error) {
      adapter.log.error(error);
    }
  });
}

/**
 * Main function
 */
async function main() {
  let connected = await asteriskConnect();
  if (connected) {
    adapter.log.info('Connected to Asterisk Manager');
    asterisk.keepConnected();
    adapter.subscribeStates('*');
    await answerCall();
  } else {
    let wait = 30;
    adapter.log.error('Cound not connect to Asterisk Manager! Try to connect in ' + wait + ' seconds again!');
    await sleep(wait * 1000);
    main();
  }
}

// If started as allInOne mode => return function to create instance
if (typeof module !== 'undefined' && module.parent) {
  module.exports = startAdapter;
} else {
  // or start the instance directly
  startAdapter();
}
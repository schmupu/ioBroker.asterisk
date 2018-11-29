'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const https = require('https');


// *****************************************************************************************************
// Text to MP3 converter. A lot of the logik is from the ioBroker.sayit adapter.
// MP3 to GSM transcoder. The shell program ffmpeg is needed
// *****************************************************************************************************
class TextToGSMConverter {

    constructor() {
        this.options = {};
    }

    getMp3FromGSMfilename(fileNameGSM) {
        return fileNameGSM.replace(/.gsm$/i, '.mp3');
    }

    getGSMFromMp3filename(fileNameMP3) {
        return fileNameMP3.replace(/.mp3$/i, '.gsm');
    }

    getFilenameExtension(filename) {
        let ext = filename.split('.').pop();
        if (ext == filename) { ext = ""; }
        return ext;
    }

    getBasename(filename) {
        return filename.split('.').slice(0, -1).join('.') || filename;
    }

    getLength(fileName, callback) {
        if (fs.existsSync(fileName)) {
            try {
                const stat = fs.statSync(fileName);
                const size = stat.size;
                if (callback) callback(null, Math.ceil(size / 4096));
            } catch (e) {
                console.log('Cannot read length of file ' + fileName);
                if (callback) callback(null, 0);
            }
        } else {
            if (callback) callback(null, 0);
        }
    }

    textSplit(text) {
        let len = 0;
        let arr = [];
        let size = 75;
        if (text && text.length > size) {
            do {
                let tmp = text.substr(0, size);
                len = -1;
                if(len == -1) len = tmp.lastIndexOf('.');
                if(len == -1) len = tmp.lastIndexOf(',');
                if(len == -1) len = tmp.lastIndexOf(' ');
                /*
                let lenp = tmp.lastIndexOf('.');
                let lenc = tmp.lastIndexOf(',');
                let lens = tmp.lastIndexOf(' ');
                len = lenp;
                if (lenc > len) len = lenc;
                if (lens > len) len = lens;
                */
                if (len != -1) {
                    tmp = text.substr(0, len + 1);
                    text = text.substr(len + 1);
                    arr.push(tmp);
                }
            } while (len != -1);
        }
        if (text.length > 0) {
            arr.push(text);
        }
        return arr;
    }

    textToMp3Old(text, language, volume, fileNameMP3) {
        return new Promise((resolve, reject) => {
            if (text.length === 0) {
                reject(new Error(`File Length ${text}, ${language}, ${volume}, 0`));
            }
            if (text.length > 200) {
                reject(new Error(`File Length ${text}, ${language}, ${volume}, greater than 200`));
            }
            // https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=%D0%BE%D1%82%D0%B2%D0%B5%D1%82%D0%B8%D1%82%D1%8C%207&tl=ru&total=1&idx=0&textlen=10
            const options = {
                host: 'translate.google.com',
                //port: 443,
                path: '/translate_tts?ie=UTF-8&client=tw-ob&q=' + encodeURI(text) + '&tl=' + language + '&total=1&idx=0&textlen=' + text.length //
            };
            let sounddata = '';
            https.get(options, res => {
                res.setEncoding('binary');
                res.on('data', chunk => sounddata += chunk);
                res.on('end', () => {
                    if (sounddata.length < 100) {
                        reject(new Error(`Cannot get file: received file is too short ${text}, ${language}, ${volume}, 0`));
                    }
                    if (sounddata.toString().indexOf('302 Moved') !== -1) {
                        reject(new Error(`http:// ${options.host}${options.path} Cannot get file: ${sounddata} ${text} ${language} ${volume} 0`));
                    }
                    fs.writeFile(fileNameMP3, sounddata, 'binary', err => {
                        if (err) {
                            reject(new Error(`File error: ${err}, ${text}, ${language}, ${volume}, 0`));
                        } else {
                            this.getLength(fileNameMP3, (error, seconds) => {
                                resolve({ error, text, language, volume, seconds });
                            });
                        }
                    });
                });
            }).on('error', err => {
                sounddata = '';
                reject(new Error(`Cannot get file: ${err}, ${text}, ${language}, ${volume}, 0`));
            });
        });
    }

    textToMp3Stream(text, language, volume) {
        return new Promise((resolve, reject) => {
            if (text.length === 0) {
                reject(new Error(`File Length ${text}, ${language}, ${volume}, 0`));
            }
            if (text.length > 200) {
                reject(new Error(`File Length ${text}, ${language}, ${volume}, greater than 200`));
            }
            // https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=%D0%BE%D1%82%D0%B2%D0%B5%D1%82%D0%B8%D1%82%D1%8C%207&tl=ru&total=1&idx=0&textlen=10
            const options = {
                host: 'translate.google.com',
                //port: 443,
                path: '/translate_tts?ie=UTF-8&client=tw-ob&q=' + encodeURI(text) + '&tl=' + language + '&total=1&idx=0&textlen=' + text.length //
            };
            let sounddata = '';
            https.get(options, res => {
                res.setEncoding('binary');
                res.on('data', chunk => sounddata += chunk);
                res.on('end', () => {
                    if (sounddata.length < 100) {
                        reject(new Error(`Cannot get file: received file is too short ${text}, ${language}, ${volume}, 0`));
                    }
                    if (sounddata.toString().indexOf('302 Moved') !== -1) {
                        reject(new Error(`http:// ${options.host}${options.path} Cannot get file: ${sounddata} ${text} ${language} ${volume} 0`));
                    }
                    resolve({ text, sounddata });
                });
            }).on('error', err => {
                sounddata = '';
                reject(new Error(`Cannot get file: ${err}, ${text}, ${language}, ${volume}, 0`));
            });
        });
    }


    mp3ToGsm(fileNameMP3, fileNameGSM, unlink = true) {
        return new Promise((resolve, reject) => {
            const ffmpeg = childProcess.spawn(
                'ffmpeg',
                [
                    '-i', fileNameMP3,
                    '-loglevel', 'error',
                    '-c:a', 'libgsm',
                    '-ar', '8000',
                    '-ab', '13000',
                    '-ac', '1',
                    '-f', 'gsm',
                    '-y', fileNameGSM,
                ]
            );
            ffmpeg.on('exit', (code, signal) => {
                if (code === 0) {
                    if (unlink) {
                        fs.unlink(fileNameMP3, (err) => {
                            if (err) {
                                reject(new Error(`Unlinking error  ${err}`));
                            } else {
                                resolve({ fileNameMP3, fileNameGSM, code, signal });
                            }
                        });
                    } else {
                        resolve({ fileNameMP3, fileNameGSM, code, signal });
                    }
                } else {
                    reject(new Error(`code ${code}; signal ${signal}`));
                }
            });
            ffmpeg.on('error', (code, signal) => reject(new Error(`code ${code}; signal ${signal}`)));
        });
    }

    textToGsm(text, language, volume, fileNameGSM, unlink = true) {
        var fileNameMP3 = this.getMp3FromGSMfilename(fileNameGSM);
        return new Promise((resolve, reject) => {
            this.textToMp3(text, language, volume, fileNameMP3)
                .then((result) => {
                    this.mp3ToGsm(fileNameMP3, fileNameGSM, unlink)
                        .then((result) => resolve(result))
                        .catch((err) => reject(err))
                })
                .catch((err) => reject(err));
        });
    }



    textToMp3(text, language, volume, fileNameMP3) {

        return new Promise((resolve, reject) => {

            let textarr = this.textSplit(text);
            let promisArray = [];

            for (let i in textarr) {
                if (textarr[i].length > 0) {
                    promisArray.push(this.textToMp3Stream(textarr[i], language, volume));
                }
            }

            Promise.all(promisArray).then(values => {
                let sounddata;
                for (let i in values) {
                    sounddata += values[i].sounddata;
                }
                fs.writeFile(fileNameMP3, sounddata, 'binary', err => {
                    if (err) {
                        reject(new Error(`File error: ${err}, ${text}, ${language}, ${volume}, 0`));
                    } else {
                        this.getLength(fileNameMP3, (error, seconds) => {
                            resolve({ error, text, language, volume, seconds });
                        });
                    }
                });
            }).catch(reason => {
               if(reason) {
                reject(new Error(reason));
               } else {
                reject(new Error(`Promise Error in textToMp3: ${err}, ${text}, ${language}, ${volume}, 0`));
               }
            });

        });
    }

}


function test(text, filename, callback) {
    var converter = new TextToGSMConverter();
    /*
    converter.textToMp3(text, 'DE', 100, filename + ".mp3") 
    .then((file) => {
            console.log("finish" + JSON.stringify(file));
            // The file is converted at path "file"
        })
        .catch((err) => {
            // An error occured
            console.log(err);
        });
    
    
    converter.mp3ToGsm(filename + ".mp3", filename + ".gsm") 
    .then((file) => {
            console.log("finish" + JSON.stringify(file));
            // The file is converted at path "file"
        })
        .catch((err) => {
            // An error occured
            console.log(err);
        });
    
    */
    converter.textToGsm(text, 'DE', 100, filename + ".gsm")
        .then((file) => {
            console.log("finish" + JSON.stringify(file));
            if (callback) callback();
            // The file is converted at path "file"
        })
        .catch((err) => {
            // An error occured
            console.log(err);
        });
}

module.exports = TextToGSMConverter;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var transcode_exports = {};
__export(transcode_exports, {
  TextToGSMConverter: () => TextToGSMConverter,
  test: () => test
});
module.exports = __toCommonJS(transcode_exports);
var import_child_process = __toESM(require("child_process"));
var import_fs = __toESM(require("fs"));
var googleTTS = __toESM(require("google-tts-api"));
var import_path = __toESM(require("path"));
var tools = __toESM(require("./tools"));
async function test(text, filename) {
  try {
    const converter = new TextToGSMConverter({ transcoder: "ffmpeg", language: "de" });
    const base64 = converter.textToGsm(text, `${filename}.gsm`, 100);
    return base64;
  } catch (err) {
  }
  return "";
}
class TextToGSMConverter {
  options;
  /**
   * Constructor
   *
   * @param options options
   * @param options.transcoder ffmpeg or sox
   * @param options.language language like de or en
   */
  constructor(options) {
    this.options = options;
  }
  /**
   * Get Transcoder
   *
   * @returns transcoder like sox or ffmpeg
   */
  getTranscoder() {
    return this.options.transcoder;
  }
  /**
   * Get Language
   *
   * @returns language like en or de
   */
  getLanguage() {
    return this.options.language;
  }
  /**
   * Convert filename with ending gsm to endning mp3
   *
   * @param fileNameGSM filename with gsm ending
   * @returns filenameMP3
   */
  getMp3FromGSMfilename(fileNameGSM) {
    return fileNameGSM.replace(/.gsm$/i, ".mp3");
  }
  /**
   * Convert filename with ending mp3 to endning gsm
   *
   * @param fileNameMP3 filename with gsm ending
   * @returns filenameGSM
   */
  getGSMFromMp3filename(fileNameMP3) {
    return fileNameMP3.replace(/.mp3$/i, ".gsm");
  }
  /**
   * delete file from drive
   *
   * @param filename filename
   * @returns true if deleted
   */
  rmfile(filename) {
    if (import_fs.default.existsSync(filename)) {
      import_fs.default.unlinkSync(filename);
    }
    if (import_fs.default.existsSync(filename)) {
      return false;
    }
    return true;
  }
  /**
   * converts text to mp3 (speech) and saves it to a file
   *
   * @param text text which will be converted to speech
   * @param fileNameMP3 mp3 filenme inkl. path
   * @param volume not used
   * @returns speech as base64 string
   */
  async textToMp3(text, fileNameMP3, volume) {
    const vol = volume;
    const rets = await googleTTS.getAllAudioBase64(text, {
      lang: this.options.language.toLowerCase(),
      slow: false
    });
    let base64 = "";
    for (const ret of rets) {
      base64 += ret.base64;
    }
    const buffer = Buffer.from(base64, "base64");
    this.rmfile(fileNameMP3);
    import_fs.default.writeFileSync(fileNameMP3, buffer, { encoding: "base64" });
    return base64;
  }
  /**
   * converts text to gsm (speech) and saves it to a file
   *
   * @param text text which will be converted to speech
   * @param fileNameGSM gsm filenme inkl. path
   * @param volume not used
   * @returns speech as base64 string
   */
  async textToGsm(text, fileNameGSM, volume) {
    const fileNameMP3 = `${import_path.default.dirname(fileNameGSM)}/${tools.getGuid()}.mp3`;
    switch (this.options.transcoder) {
      case "ffmpeg": {
        await this.textToMp3(text, fileNameMP3, volume);
        const base64 = await this.mp3ToGsmFfmpeg(fileNameMP3, fileNameGSM);
        import_fs.default.unlinkSync(fileNameMP3);
        return base64;
      }
      case "sox": {
        await this.textToMp3(text, fileNameMP3, volume);
        const base64 = await this.mp3ToGsmSox(fileNameMP3, fileNameGSM);
        import_fs.default.unlinkSync(fileNameMP3);
        return base64;
      }
      default:
        throw new Error(`Transcoder has to be sox or ffmpeg and not ${this.options.transcoder}`);
    }
  }
  /**
   * converts mp3 to gsm (speech) and saves it to a file
   *
   * @param fileNameMP3 mp3 filenme inkl. path
   * @param fileNameGSM gsm filenme inkl. path
   * @param volume not used
   * @returns speech as base64 string
   */
  async mp3ToGsm(fileNameMP3, fileNameGSM, volume) {
    const vol = volume;
    switch (this.options.transcoder) {
      case "ffmpeg":
        return await this.mp3ToGsmFfmpeg(fileNameMP3, fileNameGSM);
      case "sox":
        return await this.mp3ToGsmSox(fileNameMP3, fileNameGSM);
      default:
        throw new Error(`Transcoder has to be sox or ffmpeg and not ${this.options.transcoder}`);
    }
  }
  async mp3ToGsmFfmpeg(fileNameMP3, fileNameGSM) {
    return new Promise((resolve, reject) => {
      if (!import_fs.default.existsSync(fileNameMP3)) {
        reject(new Error(`File ${fileNameMP3} does not exists!`));
      }
      this.rmfile(fileNameGSM);
      const ffmpeg = import_child_process.default.spawn("ffmpeg", [
        "-i",
        fileNameMP3,
        "-loglevel",
        "error",
        "-c:a",
        "libgsm",
        "-ar",
        "8000",
        "-ab",
        "13000",
        "-ac",
        "1",
        "-f",
        "gsm",
        "-y",
        fileNameGSM
      ]);
      ffmpeg.on("exit", (code) => {
        if (code === 0) {
          const base64 = import_fs.default.readFileSync(fileNameGSM, { encoding: "base64" });
          if (import_fs.default.existsSync(fileNameGSM)) {
            resolve(base64);
          } else {
            reject(new Error(`Error, file ${fileNameGSM} does not exists!`));
          }
        } else {
          reject(new Error(`Error transcoding file from MP3 to GSM`));
        }
      });
      ffmpeg.on(
        "error",
        (err) => reject(new Error(`Error transcoding file from MP3 to GSM, ${err.message}`))
      );
    });
  }
  async mp3ToGsmSox(fileNameMP3, fileNameGSM) {
    return new Promise((resolve, reject) => {
      if (!import_fs.default.existsSync(fileNameMP3)) {
        reject(new Error(`File ${fileNameMP3} does not exists!`));
      }
      this.rmfile(fileNameGSM);
      const sox = import_child_process.default.spawn("sox", [fileNameMP3, "-r", "8000", "-c", "1", fileNameGSM]);
      sox.on("exit", (code) => {
        if (code === 0) {
          const base64 = import_fs.default.readFileSync(fileNameGSM, { encoding: "base64" });
          if (import_fs.default.existsSync(fileNameGSM)) {
            resolve(base64);
          } else {
            reject(Error(`Error, file ${fileNameGSM} does not exists!`));
          }
        } else {
          reject(Error(`Error transcoding file from MP3 to GSM`));
        }
      });
      sox.on("error", (err) => reject(new Error(`Error transcoding file from MP3 to GSM, ${err.message}`)));
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TextToGSMConverter,
  test
});
//# sourceMappingURL=transcode.js.map

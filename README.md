![Logo](admin/asterisk.png)

# ioBroker Asterisk VoIP Adapter


[![Travis CI Build Status](https://travis-ci.org/schmupu/ioBroker.asterisk.svg?branch=master)](https://travis-ci.org/schmupu/ioBroker.asterisk)
[![AppVeyor Build Status](https://ci.appveyor.com/api/projects/status/github/schmupu/ioBroker.asterisk?branch=master&svg=true)](https://ci.appveyor.com/project/schmupu/ioBroker-asterisk/)
[![NPM version](http://img.shields.io/npm/v/iobroker.asterisk.svg)](https://www.npmjs.com/package/iobroker.asterisk)
[![Downloads](https://img.shields.io/npm/dm/iobroker.asterisk.svg)](https://www.npmjs.com/package/iobroker.asterisk)

[![NPM](https://nodei.co/npm/iobroker.asterisk.png?downloads=true)](https://nodei.co/npm/iobroker.asterisk/)

The Asterisk adapter converts text messages to audio files and calls then over Asterisk by voip any telephone number you want and plays the audo message.

## Install

You have to install asterisk for voip calls and ffmpeg to transcode mp3 audofiles to GSM audiofiles on your ioBroker hardware. For creating text messages to audio messages the online text to speach tool from Google will be used. 

You can install asterisk and ffmpeg on Linux (Raspberry), Windows and Apple Macs Computer. If you want to install asterisk in a docker container in bridge modus, you have to expose the UDP ports 5038,5060 and the UDP Ports 7078 to 7097. 

You shall install asterisk and ffmpeg on the same hardware as ioBroker! The reason is that the audio files are stored locally and accessible from ioBroker and asterisk. 

If you want still using separated server for ioBroker and Asterisk you can use the ssh support. You still install ffmpeg or sox on the ioBroker server. Asterisk and a ssh server on the asterisk server. You find the detailed installation [here ](docs/SSH.md).

if you use Linux (Raspberry for example) and ioBroker and asterisk runs on the same server, you have to install ffmpeg and asterisk like this: 

### Linux Packages / ioBroker & asterisk running on same server with ffmpeg 
```sh
sudo apt-get install ffmpeg
sudo apt-get install asterisk
```

### Linux Packages / ioBroker & asterisk running on same server with sox 
If you have problems with transcoding with ffmpeg you can choose sox as transcoder. For that, you have to install following packages and choose sox in the adapter configuration.

```sh
sudo apt-get install lame
sudo apt-get install sox
sudo apt-get install libsox-fmt-mp3
sudo apt-get install asterisk
```

 ## Configuration

Asterisk has to connect for outgoing calls with your voip provider like Telekom or Vodfone  or with your FritzBox! 

- Configuration [Asterisk via SIP with the FritzBox](docs/SIP_FRITZBOX.md) (the easiest way)
- Configuration [Asterisk via PJSIP with the FriztBox](docs/PJSIP_FRITZBOX.md) (pjsip is more modern as sip)
- Configuration [Asterisk via PJSIP with Telekom as provider](docs/PJSIP_TELEKOM.md) 
- Configuration [Asterisk via PJSIP with Sipgate as provider](docs/PJSIP_SIPGATE.md) 
- Configuration [ssh/scp ](docs/SSH.md) (ioBroker and asterisk runs on different server)  


Now you can use the adapter in your javascript or blocky programms.

```sh
var number   = "040 666-7766";
var callerid = '040 123 999'; // optional, if not set anonymous call
var msg      = "Hello, this textmessage will be converted to audio"; 

// call telephone nummber 040 666-7766 and play text message as audio
sendTo('asterisk.0', "dial", { telnr: number, callerid: callerid, text:  msg},  (res) => {
      console.log('Result: ' + JSON.stringify(res));
});  

// call telephone nummber 040 666-7766 and play mp3 audio file
// mp3 file has to exist on asterix server
sendTo('asterisk.0', "dial", { telnr: number, callerid: callerid, aufiofile: '/tmp/audio.mp3'},  (res) => {
      console.log('Result: ' + JSON.stringify(res));
});  

// call telephone nummber 040 666-7766 and play gsm audio file 
// gsm file has to exist on asterix server
sendTo('asterisk.0', "dial", { telnr: number, callerid: callerid, aufiofile: '/tmp/audio.gsm'},  (res) => {
      console.log('Result: ' + JSON.stringify(res));
});  

// Show entered DTMF code
on({ id: "asterisk.0.dialin.dtmf"/*DTMF Code*/ },  (obj) => {
    let dtmf = obj.state.val;
    console.log("DTMF: " + dtmf);
});

// Show entered DTMF code
on({ id: "asterisk.0.dialout.dtmf"/*DTMF Code*/ },  (obj) => {
    let dtmf = obj.state.val;
    console.log("DTMF: " + dtmf);
});

```

> You can use following parameter in the sendTo dial statement:
> - **language:** language take for text to speech (tts) function. (allowed values: 'DE', 'EN', ... Default is the ioBroker system language)
> - **repeat:** how many times shall the audio message repeated (allowed values 1 to n, default 5)
> - **priority:** if you send parallel many sendTo dial  statements, the messages with a smallest priority will be send first (allowed values 1 to n, default 1)
> - **text:** text message that will be send as audio
> - **timeout:** Timeout in milliseconds waiting for connection to be happen (defaults to 60000 ms)
> - **async:** Allows multiple calls to be generated without waiting for a response (allowed values: false/true, default false)
> - **audiofile:** if you using the text parameter. The converted text to audio will be saved in  audiofile. If the audiofile exist, it will be overwritten. If you do not use the parameter text, the audiofile will be played. 
> - **callerid:** Defines the identifier (your sender telephone number)	. If callerid is missing the transferred telephone number will be anonymous

## Resolving problems

If you have problems with asterisk, you can try to find something in the logfiles under /var/log/asterisk. After you started asterisk you can call asterisk with asterisk -rvvvvvv on the comand shell for debugging. After you started asterisk -rvvvvvv you can initialize a call by iobroker and see what happens.  

## Changelog

### 1.0.4 (24.02.2019)
* (Stübi) a new documentation for using Sipgate as provide. 
* (Stübi) Now you can call internal fritzbox numbers. You must change your extensions.ael if you install the version 1.0.4! (replace **10 => { ... }**  with **_. => { ... }**) 

### 1.0.3 (23.01.2019)
* (Stübi) You can install asterisk on a different server and use scp to transfer audio files from ioBroker to asterisk.

### 1.0.2 (05.01.2019)
* (Stübi) You can use the service PJSIP instead of SIP now.    
* (Stübi) Support js-controller compact mode 

### 1.0.1 (04.01.2019)
* (Stübi) Calling without extension, if you do not use the fritzbox for example (leave sip.conf username in adapter config empty)

### 1.0.0 (04.01.2019)
* (Stübi) Instead of ffmpeg you can use now sox too

### 0.1.9 (27.12.2018)
* (Stübi) Update with languages 

### 0.1.8 (26.12.2018)
* (Stübi) Add Callerid to dialin states 

### 0.1.7 (26.12.2018)
* (Stübi) A lot of new features. Now you can call ioBroker / Asterisk by telephone number and enter a DTMF Code. 
* (Stübi) You can enter a DTMF Code if you get called by ioBroker / Asterisk 

### 0.1.6 (23.11.2018)
* (Stübi) Bugfixing and password will be saved encrypted and text message size can be unlimited 

### 0.1.5 (17.11.2018)
* (Stübi) Bugfixing

### 0.1.4 (13.11.2018)
* (Stübi) Bugfixing

### 0.1.3 (12.11.2018)
* (Stübi) Bugfixing

### 0.1.2 (12.11.2018)
* (Stübi) First Version

### 0.1.1 (11.11.2018)
* (Stübi) First Version

## Planed in the future
* Change the logic from Asterisk AMI to Asterisk AGI

## License
The MIT License (MIT)

Copyright (c) 2018 Thorsten <thorsten@stueben.de> / <https://github.com/schmupu>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

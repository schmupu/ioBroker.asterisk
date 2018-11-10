![Logo](admin/asterisk.png)

# ioBroker.asterisk
==================

[![Travis CI Build Status](https://travis-ci.org/schmupu/ioBroker.asterisk.svg?branch=master)](https://travis-ci.org/schmupu/ioBroker.asterisk)
[![AppVeyor Build Status](https://ci.appveyor.com/api/projects/status/github/schmupu/ioBroker.asterisk?branch=master&svg=true)](https://ci.appveyor.com/project/schmupu/ioBroker-asterisk/)
[![NPM version](http://img.shields.io/npm/v/iobroker.asterisk.svg)](https://www.npmjs.com/package/iobroker.asterisk)
[![Downloads](https://img.shields.io/npm/dm/iobroker.asterisk.svg)](https://www.npmjs.com/package/iobroker.asterisk)

[![NPM](https://nodei.co/npm/iobroker.asterisk.png?downloads=true)](https://nodei.co/npm/iobroker.asterisk/)


...


## Install & Configuration

---

![Fritzbox1](admin/fritzbox1.png)

![Fritzbox2](admin/fritzbox2.png)
...

/etc/asterisk/manager.conf
[general]
enabled = yes
port = 5038
bindaddr = 0.0.0.0

[manager]
secret=managerpwd
permit=192.168.1.0/255.255.255.0
read=all
write=all
```

/etc/asterisk/sip.conf
```sh
[general]
port = 5060
bindaddr = 0.0.0.0
context = default
subscribecontext = default
;                Username:Password:SIP-Server-IP/Extension of default (subscribecontext)
register => 12345689:mypassword@192.168.1.1/1000

[12345689]
type = friend
username = 123456789
host = 192.168.1.1
secret = mypassword
fromdomain = 192.168.1.1
fromuser = 123456789
callerid= 03047114711
```

/etc/asterisk/extensions.ael
```sh
globals {
	CONSOLE-AEL="Console/dsp"; 		// Console interface for demo
	IAXINFO-AEL=guest;				// IAXtel username/password
	OUTBOUND-TRUNK="Zap/g2";		// Trunk interface
	OUTBOUND-TRUNKMSD=1;			 / MSD digits to strip (usually 1 or 0)
};

context default {
  1000 => {
        Goto(ael-antwort,10,1);
  }
}

context ael-ansage {
        10 => {
                Answer();
                Wait(1);
                for (x=0; ${x} < ${repeat}; x=${x} + 1) {
                        Playback(${file});
			Playback(beep);
                	Wait(1);
                }
		Hangup();
        }
}

context ael-antwort {
	10  => {
		Answer();
		Wait(1);
		Playback(beep);
    		Wait(10);
    		Hangup();
	}
}
```

...

## Changelog

### 0.1.0 (10.11.2018)
* (Stübi) First Version


## License
The MIT License (MIT)

Copyright (c) 2018 Thorsten <thorsten@stueben.de>

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

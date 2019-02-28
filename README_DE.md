![Logo](admin/asterisk.png)

# ioBroker Asterisk VoIP Adapter

[![Travis CI Build Status](https://travis-ci.org/schmupu/ioBroker.asterisk.svg?branch=master)](https://travis-ci.org/schmupu/ioBroker.asterisk)
[![AppVeyor Build Status](https://ci.appveyor.com/api/projects/status/github/schmupu/ioBroker.asterisk?branch=master&svg=true)](https://ci.appveyor.com/project/schmupu/ioBroker-asterisk/)
[![NPM version](http://img.shields.io/npm/v/iobroker.asterisk.svg)](https://www.npmjs.com/package/iobroker.asterisk)
[![Downloads](https://img.shields.io/npm/dm/iobroker.asterisk.svg)](https://www.npmjs.com/package/iobroker.asterisk)

[![NPM](https://nodei.co/npm/iobroker.asterisk.png?downloads=true)](https://nodei.co/npm/iobroker.asterisk/)

[English manual / Englische Anleitung](README.md) 

Der Asterisk Adapter wandelt Textnachrichten in Sprachnachrichten um und ruft dann über Asterisk per VoIP eine beliebige Telefonnummer an und spielt die Sprachnachricht vor.

## Installation / Konfiguration

Asterisk muss sich für ausgehende Gespräche mit Ihrem VoIP Provider wie mit der Telekom oder Vodafone oder mit Ihrer FritzBox verbinden! Bitte folge einer dieser Installationsanleitungen.

- Konfiguration [Asterisk mit SIP über die FritzBox](docs/SIP_FRITZBOX_DE.md) (der einfachste Weg)
- Konfiguration [Asterisk mit PJSIP über die FriztBox](docs/PJSIP_FRITZBOX_DE.md) (pjsip ist moderner als pjsip, aber komplizierter)
- Konfiguration [Asterisk mit PJSIP über die Telekom als SIP Provider](docs/PJSIP_TELEKOM_DE.md) 
- Konfiguration [Asterisk mit PJSIP über Sipgate als SIP Provider](docs/PJSIP_SIPGATE_DE.md) 
- Konfiguration [ssh/scp ](docs/SSH_DE.md) (ioBroker und Asterisk sind auf verschiedenen Servern installiert)  

## Nutzung von Asterisk

### Nutzung von Asterisk mit Objketen / Status für ausgehende Annrufe

Die einfachste Möglichkeit Asterisk zu verwenden ist es die Seite mit den ioBroker Objekten aufzurufen. Fülle dort die folgenden Felder unter dialout aus:
* call: Anruf tätigen
* callerid: Absender Telefonnummer. Wird dem angerufenem angezeigt
* dtmf: Nummern die der Anrufer auf seinem Telefon gedrückt hat
* telnr: Nummer des anzufrufendem 
* text: Text dem der Anrufer vorgespielt wird

![iobroker_dialout](docs/iobroker_dialout.png)

### Nutzung von Asteriks mit Objekten / Status für eingehende Anrufe

Wenn Du den SIP-Provider (zum Beispiel Fritzbox, Sipgate, ...) und die Asterisk Konfiguration so konfiguriert hast das eingehende Anrufe zulässt, kannst Du folgende Einstellungen in dialin vornehmen

* callerid: Telefnommer von dem Anrufer
* dtmf: Nummern die der Anrufer auf seinem Telefon gedrückt hat
* text: Text dem der Anrufer vorgespielt wird

![iobroker_dialin](docs/iobroker_dialin.png)

### Nutzung von Asterisk mit javascript oder blocky um Anrufe zu tätigen

Beispielprogramm um jemanden anzurufen und eine Nachricht vorzuspielen

```sh
var number   = "040 666-7766";
var callerid = '040 123 999'; // Optional
var msg      = "Hello, this textmessage will be converted to audio"; 

// rufe Telefonnumer 040 666-7766 and und spiele Textnachricht als Sprachnachricht ab
sendTo('asterisk.0', "dial", { telnr: number, callerid: callerid, text:  msg},  (res) => {
      console.log('Result: ' + JSON.stringify(res));
});  

// rufe Telefonnummer 040 666-7766 an und spiele Audiodatei im MP3 Format ab
// MP3 Datei muss auf dem Asterisk Server existieren
sendTo('asterisk.0', "dial", { telnr: number, callerid: callerid, aufiofile: '/tmp/audio.mp3'},  (res) => {
      console.log('Result: ' + JSON.stringify(res));
});  

// rufe Telefonnummer 040 666-7766 an und spiele Audiodatei im GSM Format ab
// GSM Datei muss auf dem Asterisk Server existieren
sendTo('asterisk.0', "dial", { telnr: number, callerid: callerid, aufiofile: '/tmp/audio.gsm'},  (res) => {
      console.log('Result: ' + JSON.stringify(res));
});  

// Zeige bei eingehendem Anruf DTMF Nachricht an
on({ id: "asterisk.0.dialin.dtmf"/*DTMF Code*/ },  (obj) => {
    let dtmf = obj.state.val;
    console.log("DTMF: " + dtmf);
});

// Zeige bei ausgehendem Anruf DTMF Nachricht an
on({ id: "asterisk.0.dialout.dtmf"/*DTMF Code*/ },  (obj) => {
    let dtmf = obj.state.val;
    console.log("DTMF: " + dtmf);
});

```

> In der Anweisung sendTo dial können Sie folgende Parameter verwendet werden:
> - **language:** Sprache für die Umwandung der Textnachricht in eine Sprachnachricht (zulässige Werte: 'DE', 'EN', ... Der Standardwert ist die ioBroker Systemsprache)
> - **repeat:** wie oft soll die Audio-Nachricht wiederholt werden (zulässige Werte 1 bis n, Standard 5)
> - **priority:** Wenn du parallel viele sendTo-Dial-Anweisungen sendest, werden die Nachrichten mit der höchsten Priorität (1) zuerst gesendet (zulässige Werte 1 bis n, Standard 1).
> - **text:** Textnachricht, die als Sprachnachricht gesendet werden soll
> - **timeout:** Timeout in Millisekunden, bis die Verbindung hergestellt wird (Standardeinstellung 60000 ms)
> - **async:** Ermöglicht das auführen von mehreren Aufrufe ohne auf eine Antwort zu warten (zulässige Werte: false / true Standardwert false). Bei Async false, werden die Anrufe hintereinander getätigt.
> - **audiofile:** Es wird das Audiofile abgespielt. Das muss im GSM oder MP3 Format vorliegen. Parameter **text** muss leer bleiben. Audiodatei muss auf dem Asterisk Server liegen.
> - **callerid:** Absender Telefonnummer.

## Problembehebung

Wenn Du Probleme hast, schaue in die Protokolldateien unter /var/log /asterisk auf dem Asterisk Server. Wenn asterisk läuft, kannst Du auch **asterisk -rvvvvvv** eingeben. Du siehst dann was Asterisk tut.
Auch kann man den Loglevel in ioBroker für Asterisk von Info auf Debug setzen. Damit erhält man allerhand mehr Informationen. 

## Changelog

[Changelog](CHANGELOG.md)

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

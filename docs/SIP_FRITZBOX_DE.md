![Logo](../admin/asterisk.png)

# ioBroker Asterisk VoIP Adapter

## Installation und Grundeinstellungen

Du musst für Asterisk das Paket ffmpeg oder sox installieren um MP3-Audiodateien in GSM-Audiodateien umzuwandeln. 

Du kannst Asterisk unter Linux (Raspberry), Windows und Apple Macs Computer installieren. Wenn Du Asterisk in einem Docker-Container im Bridge-Modus installieren möchtest, musst Du Sie die UDP-Ports 5038,5060 und die UDP-Ports 7078 bis 7097 im Container exposen.

Asterisk muss auf dem gleichen Server wie ioBroker installiert werden, da auf die Sprachnachrichten (Audiodateien) von ioBroker sowie Asterisk zugegriffen wird.

Sollten ioBroker und Asterisk auf getrennten Servern laufen kannst Du ssh dafür nutzen. Hier wird weiterhin ffmpeg oder sox auf dem ioBroker Server benötigt. Ein ssh Client muss auf dem ioBroker Server und ein ssh Server auf dem Asterisk Server installiert sein. Eine detaillierte Installationsanleitung findest Du hier (SSH_DE.md). Die Trennung von ioBroker und Asterisk sollte nur vorgenommen werden, wenn man gute Linux Kenntnisse hat.

Unter Linux (z.B. Raspberry) installiere folgende Pakete:

### Linux Pakckete / ioBroker & Asterisk laufen auf dem gleichen Server 
```sh
sudo apt-get install ffmpeg
sudo apt-get install lame
sudo apt-get install sox
sudo apt-get install libsox-fmt-mp3
sudo apt-get install asterisk
```

## Installation und Konfiguration

Zunächst musst Du in der Fritzbox ein neues LAN / WLAN Telefongerät hinzufügen. 
In meinem Beispiel hat die FritzBox die IP-Adresse 192.168.1.1, der Benutzername und Kennwort des LAN / WLAN Telefongeräts lautet *12345689* und *meinPasswort*. Die Telefonnummer für abgehende und ankommende Anrufe ist * 03047114711 *.

![Fritzbox1](fritzbox1.png)

Wenn Du nicht möchten das ioBroker auf eingehende Anrufe reagiert, lasse  einfach  "nur auf folgende Rufnummern reagieren" leer. Wichtig ist, dass der Benutzername des Fritzbox LAN / WLAN Telefongeräts nur aus Zahlen besteht. Beispiel: 12345689, 00004711 oder 47110815!


![Fritzbox2](fritzbox2.png)
 
Zuerst musst Du die Verbindung zwischen ioBroker und  Asterisk auf der Registerkarte "Asterisk Einstellungen" konfigurieren.
Normalerweise lautet der Benutzername **manager**. Du kannst ein beliebiges Passwort auswählen. Der Benutzername und das Passwort müssen jedoch später mit den Einträgen in der manager.conf identisch sein.
Diese Konfiguration ist unabhängig vom  SIP-Provider wie z.B. Fritzbox, Telekom oder Sipgate.

![iobroker_main](iobroker_main.png)

Wenn Du mit den "Asterisk Einstellungen" fertig bist, wechsle auf die Registerkarte "SIP Einstellungen". Wähle als Service **sip** aus.  Gebe nun folgendes ein:

1. IP/Hostname des SIP Servers: Die IP Adresse Deiner Fritzbox (in unserem Beispiel 192.18.1.1)  
2. Benutzername des SIP Servers: Hier trägst du den Benutzernamen der auf dem Reiter Anmeldedaten Deines Fritzbox Telefoniegeräts steht ein (in unserem Beispiel 123456789)
3. Password of SIP Server: Hier trägst du das Kennwort welches auf dem Reiter Anmeldedaten Deines Fritzbox Telefoniegeräts steht ein 

![Iobroker_fritzbox_sip](iobroker_fritzbox_sip.png)

Die Registerkarte "SSH" lässt Du leer. Diese ist nur auszufüllen wenn Asterisk nicht auf dem gleichen Server wie ioBroker läuft.
Mehr Infos dazu findest Du unter [ssh/scp](SSH_DE.md).

### Automatische Erstellung der Asterisk Konfiguration

Gehe auf den Reiter "Asterisk Settings" und aktiviere das Kontrollkästchen "Anlegen der Asterisk Konfigurationsdateien (einmalig)". Drücke anschließend auf „Speichern und Schließen". Nun befinden sich die Konfigurationsdateien im /tmp/ Verzeichnis. Kopiere diese wie unten beschrieben das Verzeichnis /etc/asterisk. Die Benutzerberechtigungen der Dateien im /etc/asterisk Verzeichnis müssen unverändert bleiben. Vielleicht müssen die Berechtigungen nach dem Kopieren angepasst werden. 


Bitte Dateien wie folgt kopieren:

```sh
sudo mv /tmp/extensions.ael /etc/asterisk/extensions.ael
sudo mv /tmp/manager.conf /etc/asterisk/manager.conf
sudo mv /tmp/sip_fritzbox.conf /etc/asterisk/sip.conf
sudo mv /tmp/rtp.conf /etc/asterisk/rtp.conf

# Example if userrights of files have owner asterisk and group asterisk
sudo chown asterisk:asterisk  /etc/asterisk/extensions.ael
sudo chown asterisk:asterisk /etc/asterisk/manager.conf
sudo chown asterisk:asterisk /etc/asterisk/sip.conf
sudo chown asterisk:asterisk /etc/asterisk/rtp.conf

# Asterisk neu starten
sudo /etc/init.d/asterisk restart
```

Ist der Kopiervorgang abgeschlossen muss erst die Asterisk und danach die Asterisk ioBroker Instanz neu gestartet werden. 
Jetzt sollte der Asterisk Adapter funktionieren. Entferne noch die überflüssigen Konfigurationsdateien aus dem /tmp/ Verzeichnis da diese Passwörter enthalten.

### Manuelle Erstellung der Asterisk Konfiguration

Die Konfigurationsdateien können auch manuell erstellt werden. Dafür sind die alten 4 Konfigurationsdateien durch die unten beschriebenen Dateien zu ersetzen. Dabei ändere nicht die Benutzerberechtigungen. 

**/etc/asterisk/manager.conf**
```sh
[general]						; Do not change
enabled = yes						; Do not change
port = 5038						; Do not change
bindaddr = 0.0.0.0					; Do not change

[manager]						; Do not change
secret = managerpassword				; Change Manager password for ioBroker asterisk adapter
permit = 0.0.0.0/0.0.0.0                                ; Change to your subnet and netmask if you like
read = all						; Do not change
write = all						; Do not change
```

In der Datei */etc/asterisk/manager.conf* ersetzte die Werte für *secret* und *permit* mit (your subnet / subnet mask). 

**/etc/asterisk/rtp.conf**
```sh
[general]
rtpstart=30000
rtpend=30100
```
In der Datei */etc/asterisk/rtp.conf* änderst Du nichts. Kopiere diese nur.

**/etc/asterisk/sip.conf** 
```sh
[general]				; Do not change
port = 5060				; Do not change
bindaddr = 0.0.0.0			; Do not change
context = default			; Do not change
subscribecontext = default		; Do not change


register => 12345689:mypassword@192.168.1.1/1000 ; Username, Password and IP address of Fritzbox WLAN/LAN telephone

[123456789]               		; Change to username of Fritzbox WLAN/LAN telephone
type = friend			    	; Do not change
username = 123456789      		; Change to username of Fritzbox WLAN/LAN telephone
host = 192.168.1.1        		; Change hostname / IP address of Fritzbox
secret = mypassword       		; Change password of Fritzbox WLAN/LAN telephone
fromdomain = 192.168.1.1  		; Change hostname / IP address of Fritzbox
fromuser = 123456789   	  		; Change username of Fritzbox WLAN/LAN telephone
```

In der Datei */etc/asterisk/sip.conf* ändere *host* durch (IP Adresse der Fritzbox oder des VoIP Providers), *secret*, *username*, *fromuser* mit dem hinterlegtem Benutzernamen und Password in der Fritzbox oder Deines VoIP Anbieters. 

Ändere die *callerid* mit der Telefnonnummer Deiner Fritzbox. Wichtig, der Fritzbox Benutzername darf nur aus Zahlen bestehen. Beispiel: 12345689, 00004711 oder 47110815 !!

**/etc/asterisk/extensions.ael**
```sh
context default {
  	1000 => {
        Goto(ael-antwort,s,1);
  	}
}

context ael-ansage {
	_. => {
        Answer();
        Wait(1);
		Read(dtmf,${file}&beep,0,s,${repeat},1);
		if ("${dtmf}" != "") {
			SayDigits(${dtmf});
		}
		Hangup();
    }

	h =>  {
    	if ("${del}" = "delete") {
				NoOp(/bin/rm ${file}.*);
                System(/bin/rm ${file}.*);
		}
	}	
}

context ael-antwort {
	s  => {
		Answer();
		Wait(1);
		Set(repeat=5);
		Read(dtmf,/tmp/asterisk_dtmf&beep,0,s,${repeat},1);
		if ("${dtmf}" != "") {
			SayDigits(${dtmf});
		}
    	Hangup();
	}

	_.  => {
        Goto(ael-antwort,s,1);
  	}	  
}
```
Ersetze den Inhalt der Datei */etc/asterisk/extensions.ael* ohne Änderungen.

Nun muss der Asterisk Server neu gestartet werden. Dieses geschieht z.b. über */etc/init.d/asterisk restart*. Nun sollte sich ioBroker mit dem Asterisk Server verbinden. 
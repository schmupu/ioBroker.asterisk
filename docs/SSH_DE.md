![Logo](../admin/asterisk.png)

# ioBroker Asterisk VoIP Adapter

## Installation

Mit der SSH kannst Du ioBroker und Asterisk auf unterschiedlichen Servern betreiben. Auf dem Asterisk Server musst Du einen SSH Server wie openssh installieren. 

### Linux Pakete auf dem ioBroker und Asterisk Server
```sh
# ioBroker server
sudo apt-get install ffmpeg
sudo apt-get install lame
sudo apt-get install sox
sudo apt-get install libsox-fmt-mp3
sudo apt install openssh-client
```

```sh
# asterisk server
sudo apt-get install asterisk
sudo apt-get install openssh-server
```

## Konfiguration von Asterisk mit SSH
Nun musst Du auf dem Asterisk Server einen Benutzer einrichten, der über SSH erreichbar ist und Asterisk Benutzerberechtigungen besitzt. Damit ist sichergestellt, dass die kopierten Audiodateien per SSH von ioBroker für Asterik lesbar sind.
Lege nun eine ein Verzeichnis auf dem Asterisk Server mit dem eben angelegten Benutzer an. Das Verzeichnis trägst Du in der ioBroker Konfiguration in dem Feld *'Path for temporary audio files'* ein. 
Ist das geschehen muss die Instanz des Adapters neu gestartet werden. Jetzt werden Audiofiles in ioBroker erstellt und per scp an den Asterisk Server kopiert.

![ssh](iobroker_ssh.png)
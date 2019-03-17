![Logo](../admin/asterisk.png)

# ioBroker Asterisk VoIP Adapter

### 1.0.7 (15.03.2019)
* (Stübi) Redesign node v8 and async

### 1.0.6 (27.02.2019)
* (Stübi) Update documentation and templates

### 1.0.5 (26.02.2019)
* (Stübi) Asterisk adapter can create now asterisk configuration files. You have to rename and move them afterwards to the /etc/asterisk directory 

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

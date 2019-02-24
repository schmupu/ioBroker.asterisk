![Logo](../admin/asterisk.png)

# ioBroker Asterisk VoIP Adapter

## Install & Configuration of Asterisk with the provider Telekom by using PJSIP 

First you have to install all the packages described [here](../README.md).


The telphone number for outgoing and incoming calls is *03047114711*. Now you have to edit the following asterisk configuration files. Delete the old staff in this 4 files! Do not change the user authority and rights of the files.
 
**/etc/asterisk/manager.conf**
```sh
[general]						; Do not change
enabled =  yes						; Do not change
port =  5038						; Do not change
bindaddr =  0.0.0.0					; Do not change

[manager]						; Do not change
secret =  managerpassword				; Change Manager password for ioBroker asterisk adapter
permit =  192.168.1.0/255.255.255.0  			; Change to your subnet and netmask
read =  all						; Do not change
write =  all						; Do not change
```
You have to change in */etc/asterisk/manager.conf* the values *secret*, *permit* (your subnet + subnet mask). 

**/etc/asterisk/rtp.conf**
```sh
[general]
rtpstart = 30000
rtpend = 30100
```
You have to change in */etc/asterisk/rtp.conf* the values *secret*, *permit* (your subnet + subnet mask). 

**/etc/asterisk/pjsip.conf** 
```sh
[global]
type = global
endpoint_identifier_order = ip,username

[transport-udp]
type = transport
protocol = udp
bind = 0.0.0.0
local_net = 192.168.1.0/24	; Change here

[transport-tcp]
type = transport
protocol = tcp
bind = 0.0.0.0
local_net = 192.168.1.0/24	; Change here

[iobroker]
type = registration
transport = transport-udp
outbound_auth = iobroker
server_uri = sip:tel.t-online.de
client_uri = sip:$countrymynumber@tel.t-online.de	; Change here
contact_user = $mynumber
retry_interval = 60
forbidden_retry_interval = 300
expiration = 480
auth_rejection_permanent = false

[iobroker]
type = auth
auth_type = userpass
password = $pin:$zugangsnummer-$mitbenutzernr@t-online.de ; Change here
username = $mynumber
realm = tel.t-online.de

[iobroker]
type = endpoint
transport = transport-udp
context = ael-antwort
disallow = all
allow = g722
allow = alaw
outbound_auth = iobroker
aors = iobroker
callerid = $mynumber	; Change here
from_user = $mynumber	; Change here
from_domain = tel.t-online.de
timers = no
rtp_symmetric = yes

[iobroker]
type = aor
contact = sip:$countrymynumber@tel.t-online.de	; Change here

[iobroker]
type = identify
endpoint = iobroker
match = 217.0.0.0/13

```
You have to change in */etc/asterisk/psip.conf* a view things. Please replace the place holder **$mynumber**, ... like described:

- **$mynumber**			    : my telephonenumber with areacode. For example: 03047114711 (no spaces)
- **$countrymynumber**	    : my telephonenumber with countrycode. For example: +493047114711 (no spaces)
- **$zugangsnummer**		: zungangsnummer like 532496966969
- **$mitbenutzernr**		: Mitbenutzernummer like 0001
- **$pin**					: your Telekom password (persönliches Kennwort) like 34242322

the hostname, username and password configured in the Fritzbox or in the configruation of your VoIP Provider. Pleas do not change the other parameter. 

**/etc/asterisk/extensions.ael**
```sh
context default {
  	1000  => {
        Goto(ael-antwort,s,1);
  	}
}

context ael-ansage {
	_. 	=> {
        Answer();
        Wait(1);
		Read(dtmf,${file}&beep,0,s,${repeat},1);
		if ("${dtmf}"  ! =  "") {
			SayDigits(${dtmf});
		}
		Hangup();
        }
}

context ael-antwort {
	s   => {
		Answer();
		Wait(1);
		Set(repeat = 5);
		Read(dtmf,/tmp/asterisk_dtmf&beep,0,s,${repeat},1);
		if ("${dtmf}"  ! =  "") {
			SayDigits(${dtmf});
		}
    		Hangup();
	}

	_.  => {
        Goto(ael-antwort,s,1);
  	}
	  
}
```
Copy the content above into the */etc/asterisk/extensions.ael* and do not change anything! If you change something here, your ioBroker dial command will not work.

For starting the asterisk server type */etc/init.d/asterisk start*
Now you have to connect ioBroker with the asterisk server. If the ioBroker and the asterisk server use as IP adress 192.168.1.2 you have to configure this IP and the port, username and password from the */etc/asterisk/manager.conf*. For username sip.conf or pjsip.conf enter *iobroker*. You have enter a path for temporary audio files. This path must be accessible and authorized for Asterisk and ioBroker. 

![Iobroker1](iobroker_fritzbox_pjsip.png)

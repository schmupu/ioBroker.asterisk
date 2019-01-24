![Logo](../admin/asterisk.png)

# ioBroker Asterisk VoIP Adapter

## Install & Configuration of Asterisk with using SSH 

With ssh / scp option you have the posibility to install ioBroker and asterisk on different server. On the asterisk server you have to install a ssh server like oppenssh. 

```sh
sudo apt-get install open-ssh
```

Now you need on the asterisk server an user with access to login by ssh. The user must have the rights to write files which can read by asterisk. 
You create on the asterisk server the directory with the name you configured in the iobroker asterisk adapter configuration under the name *'Path for temporary audio files. Must be accessible and authorized for Asterisk and ioBroker'*.  The path has only acceable from asterisk and not ioBroker if you are using ssh!  


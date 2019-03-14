![Logo](../admin/asterisk.png)

# ioBroker Asterisk VoIP Adapter

## Install Asterisk with using SSH 

With ssh / scp option you have the posibility to install ioBroker and asterisk on different server. On the asterisk server you have to install additional a ssh server like oppenssh and you do not have to install astersik on the ioBroker server. 


### Linux Packages / ioBroker on asterisk running on different server with ffmpeg 
```sh
# ioBroker server
sudo apt-get install ffmpeg
sudo apt install openssh-client
```

```sh
# asterisk server
sudo apt-get install asterisk
sudo apt-get install openssh-server
```

### Linux Packages / ioBroker on asterisk running on different server with sox
```sh
# ioBroker server
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

## Configuration of Asterisk with using SSH 

Now you need on the asterisk server an user with access to login by ssh. The user must have the unix user rights to write files which can read by asterisk. 
You create on the asterisk server the directory with the name you configured in the iobroker asterisk adapter configuration under the name *'Path for temporary audio files'*. The path must be accessible and authorized for asterisk and ssh, because iobroker sends the generated audiofile (your text message), by scp to the asterisk server and save it in the 'Path for temporary audio files'. 
After that ioBroker will send by the AMI api a message to asterisk to dial an play the generated audiofile saved in the given path.

![ssh](iobroker_ssh.png)


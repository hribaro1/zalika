# ESC/POS Print Server za Raspberry Pi

Ta print server se izvaja na Raspberry Pi 3 in omogoča tiskanje naročil preko ESC/POS tiskalnika, povezanega preko USB.

## Sistemske zahteve

- Raspberry Pi 3 (ali novejši)
- Raspberry Pi OS (Raspbian)
- ESC/POS USB tiskalnik
- Node.js 14 ali novejši
- Povezava do glavnega strežnika (preko LAN ali WAN)

## Namestitev

### 1. Priprava Raspberry Pi

Posodobite sistem:
```bash
sudo apt-get update
sudo apt-get upgrade -y
```

Namestite Node.js (če še ni nameščen):
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Preverite verzijo:
```bash
node --version
npm --version
```

### 2. Namestite potrebne sistemske knjižnice

Za ESC/POS tiskalnik potrebujete libusb:
```bash
sudo apt-get install -y libusb-1.0-0-dev build-essential
```

### 3. Priključite USB tiskalnik

Priključite ESC/POS tiskalnik na USB priključek Raspberry Pi in preverite, ali je prepoznan:
```bash
lsusb
```

Primer izhoda:
```
Bus 001 Device 004: ID 0416:5011 Winbond Electronics Corp. Virtual Com Port
```

Preverite USB naprave v /dev:
```bash
ls -l /dev/usb/
```

### 4. Nastavite dovoljenja za USB

Ustvarite udev pravilo za dostop do tiskalnika brez root pravic:
```bash
sudo nano /etc/udev/rules.d/99-escpos.rules
```

Dodajte (prilagodite idVendor in idProduct glede na vaš tiskalnik):
```
SUBSYSTEM=="usb", ATTRS{idVendor}=="0416", ATTRS{idProduct}=="5011", MODE="0666"
```

Ponovno naložite pravila:
```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

### 5. Namestitev print server aplikacije

Kopirajte mapo `raspberry-pi-print-server` na Raspberry Pi:
```bash
scp -r raspberry-pi-print-server pi@raspberry-pi-ip:/home/pi/
```

Ali klonirajte repozitorij direktno na Raspberry Pi:
```bash
cd ~
git clone https://github.com/yourusername/zalika.git
cd zalika/raspberry-pi-print-server
```

Namestite odvisnosti:
```bash
npm install
```

### 6. Konfiguracija

Ustvarite `.env` datoteko:
```bash
cp .env.example .env
nano .env
```

Uredite nastavitve:
```env
SERVER_URL=http://ip-glavnega-streznika:3000
PRINTER_NAME=RaspberryPi-Store
```

**POMEMBNO**: Zamenjajte `ip-glavnega-streznika` z dejanskim IP naslovom vašega glavnega strežnika.

### 7. Testiranje

Najprej testirajte tiskalnik:
```bash
node test-printer.js
```

Če test uspe, bo tiskalnik natisnil testni račun.

Nato ročni zagon print serverja za testiranje:
```bash
node print-server.js
```

Če je vse v redu, bi morali videti:
```
Starting ESC/POS Print Server...
Server URL: http://ip-glavnega-streznika:3000
Printer Name: RaspberryPi-Store
Connected to server: socket-id
Print client registered successfully: socket-id
Print server is running and waiting for jobs...
```

### 8. Avtomatski zagon (systemd)

Ustvarite systemd servis za avtomatski zagon ob zagonu:
```bash
sudo nano /etc/systemd/system/print-server.service
```

Vsebina (ali kopirajte print-server.service iz projekta):
```ini
[Unit]
Description=ESC/POS Print Server za trgovino
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/raspberry-pi-print-server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node print-server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Ali enostavno kopirajte:
```bash
sudo cp print-server.service /etc/systemd/system/
```

Omogočite in zaženite servis:
```bash
sudo systemctl daemon-reload
sudo systemctl enable print-server.service
sudo systemctl start print-server.service
```

Preverite status:
```bash
sudo systemctl status print-server.service
```

Oglejte si dnevnik:
```bash
sudo journalctl -u print-server.service -f
```

## Uporaba

Ko je print server zagnan in povezan na glavni strežnik, lahko iz spletne aplikacije pošljete naročila na tiskanje:

1. V spletni aplikaciji odprite naročilo
2. Kliknite na gumb "Natisni"
3. Naročilo se bo poslalo na Raspberry Pi
4. Tiskalnik bo natisnil račun

## Odpravljanje težav

### Tiskalnik ni prepoznan

Preverite, ali je tiskalnik priključen:
```bash
lsusb
```

Če tiskalnik ni viden, preverite napajanje in USB kabel.

### Napake pri povezavi

Preverite, ali je glavni strežnik dostopen:
```bash
ping ip-glavnega-streznika
curl http://ip-glavnega-streznika:3000
```

Preverite požarni zid:
```bash
sudo ufw status
```

### Napake pri tiskanju

Preverite dnevnik za podrobnosti:
```bash
sudo journalctl -u print-server.service -n 50
```

Preverite USB dovoljenja:
```bash
ls -l /dev/usb/lp*
```

### Ponovno zagon servisa

```bash
sudo systemctl restart print-server.service
```

### Zaustavitev servisa

```bash
sudo systemctl stop print-server.service
```

## Posodobitve

Za posodobitev kode:
```bash
cd ~/raspberry-pi-print-server
git pull
npm install
sudo systemctl restart print-server.service
```

## Varnost

- Zagotovite, da je Raspberry Pi v varnem omrežju
- Uporabite močna gesla za SSH dostop
- Razmislite o uporabi VPN za povezavo med print serverjem in glavnim strežnikom
- Redno posodabljajte sistem in Node.js pakete

## Podpora

Za težave in vprašanja odprite issue na GitHub repozitoriju.

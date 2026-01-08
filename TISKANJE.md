# Spremembe sistema tiskanja - PDF → ESC/POS

## Pregled sprememb

Sistem tiskanja naročil je bil spremenjen iz PDF tiskanja v brskalniku na tiskanje preko ESC/POS tiskalnika, povezanega preko Raspberry Pi 3 print strežnika.

## Arhitektura

```
┌─────────────────┐         WebSocket          ┌──────────────────┐
│  Web Aplikacija │ ◄─────────────────────────► │  Node.js Server  │
│   (Brskalnik)   │                              │   (server.js)    │
└─────────────────┘                              └────────┬─────────┘
                                                          │
                                                          │ WebSocket
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │   Raspberry Pi 3     │
                                               │   Print Server       │
                                               └──────────┬───────────┘
                                                          │
                                                          │ USB
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │  ESC/POS Tiskalnik   │
                                               └──────────────────────┘
```

## Spremenjene datoteke

### 1. `server.js` (Glavni strežnik)
**Dodano:**
- Sledenje povezanim print klientom (`printClients` Map)
- WebSocket event `registerPrintClient` - registracija Raspberry Pi print klienta
- WebSocket event `printOrder` - sprejem zahteve za tiskanje iz spletne aplikacije
- WebSocket event `printComplete` - potrditev tiskanja iz print klienta
- Pošiljanje naročila vsem povezanim print klientom

### 2. `public/script.js` (Klientska aplikacija)
**Odstranjeno:**
- `generateOrderPDF()` funkcija
- jsPDF knjižnica

**Dodano:**
- `sendToPOSPrinter(order)` funkcija - pošlje naročilo na tiskanje preko WebSocket
- Socket event handlerji:
  - `printSuccess` - uspešno poslano na tiskalnik
  - `printError` - napaka pri tiskanju
  - `printNotification` - obvestilo o natisnjenem naročilu

### 3. `public/index.html`
**Odstranjeno:**
- jsPDF CDN script tag

### 4. Novi direktorij: `raspberry-pi-print-server/`

**Datoteke:**
- `package.json` - Node.js projekt za Raspberry Pi
- `print-server.js` - Glavni print server program
- `.env.example` - Primer konfiguracijske datoteke
- `.gitignore` - Git ignore za Raspberry Pi projekt
- `print-server.service` - Systemd servis za avtomatski zagon
- `test-printer.js` - Testna skripta za preverjanje tiskalnika
- `README.md` - Podrobna navodila za namestitev in uporabo

## Nove odvisnosti

### Glavni strežnik
Brez sprememb - uporablja obstoječe `socket.io`.

### Raspberry Pi Print Server
```json
{
  "socket.io-client": "^4.8.1",
  "escpos": "^3.0.0-alpha.6",
  "escpos-usb": "^3.0.0-alpha.4"
}
```

## Tok podatkov - Tiskanje naročila

1. **Uporabnik klikne "Natisni" v spletni aplikaciji**
   - Klic funkcije `sendToPOSPrinter(order)`
   - Pošlje WebSocket event `printOrder` s `orderId`

2. **Glavni strežnik (server.js)**
   - Prejme `printOrder` event
   - Pridobi polne podatke naročila iz MongoDB
   - Preveri, ali so povezani print klienti
   - Pošlje event `print` vsem povezanim Raspberry Pi klientom

3. **Raspberry Pi Print Server**
   - Prejme event `print` s podatki naročila
   - Formatira podatke v ESC/POS ukaze
   - Pošlje na USB tiskalnik
   - Pošlje nazaj `printComplete` event

4. **Glavni strežnik**
   - Prejme `printComplete`
   - Broadcastne `printNotification` vsem klientom

5. **Spletna aplikacija**
   - Prikaže potrditev `printSuccess` ali napako `printError`

## Prednosti nove rešitve

1. **Centralizirano tiskanje** - En tiskalnik v trgovini, dostopen iz kateregakoli naprava
2. **Brez gonilnikov** - Ne potrebuje gonilnikov na delovnih postajah
3. **ESC/POS optimizacija** - Hiter, zanesljiv, poceni termični tisk
4. **Enostavna skalabilnost** - Lahko dodate več tiskalnikov (več Raspberry Pi)
5. **Realno-časovna povezava** - WebSocket omogoča takojšnje tiskanje
6. **Nizki stroški** - Raspberry Pi 3 + ESC/POS tiskalnik (~100-200 EUR)

## Namestitev in uporaba

Glejte podrobna navodila v [raspberry-pi-print-server/README.md](raspberry-pi-print-server/README.md)

## Varnostne priporočila

1. Postavite Raspberry Pi v varno lokalno omrežje
2. Uporabite močna gesla za SSH dostop
3. Razmislite o VPN za povezavo, če je strežnik zunaj lokalnega omrežja
4. Redno posodabljajte sistem in pakete
5. Omejite dostop do glavnega strežnika z požarnim zidom

## Vzdrževanje

### Preverjanje statusa print serverja
```bash
sudo systemctl status print-server.service
```

### Ogled dnevnika
```bash
sudo journalctl -u print-server.service -f
```

### Ponovno zagon
```bash
sudo systemctl restart print-server.service
```

## Težave in rešitve

Glejte sekcijo "Odpravljanje težav" v [raspberry-pi-print-server/README.md](raspberry-pi-print-server/README.md)

## Testiranje

1. Testirajte tiskalnik:
   ```bash
   cd raspberry-pi-print-server
   node test-printer.js
   ```

2. Zaženite print server:
   ```bash
   node print-server.js
   ```

3. V spletni aplikaciji kliknite "Natisni" na kateremkoli naročilu

## Kompatibilnost

- **ESC/POS tiskalniki**: Večina termičnih računov tiskalnikov (80mm)
- **Raspberry Pi**: Raspberry Pi 3, 3B+, 4 (priporočeno)
- **Operacijski sistem**: Raspberry Pi OS (Raspbian) Buster ali novejši
- **Node.js**: Verzija 14 ali novejša

## Nadaljnji razvoj

Možne izboljšave:
- Podpora za več tiskalnikov (load balancing)
- Čakalna vrsta za tiskanje
- E-poštna potrditev po tiskanju
- Zgodovina tiskanja v bazi podatkov
- Web vmesnik za konfiguracijo print serverja
- Podpora za omrežne (LAN/WiFi) ESC/POS tiskalnike

#!/bin/bash
# Hitri start za Raspberry Pi print server

echo "==================================="
echo "Raspberry Pi Print Server Setup"
echo "==================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js ni nameščen!"
    echo "Namestite z: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

echo "✓ Node.js verzija: $(node --version)"
echo "✓ npm verzija: $(npm --version)"
echo ""

# Check if in correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Niste v pravilnem direktoriju!"
    echo "Pojdite v: cd ~/raspberry-pi-print-server"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Nameščam odvisnosti..."
    npm install
    echo ""
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env datoteka ne obstaja!"
    echo "Ustvarjam iz .env.example..."
    cp .env.example .env
    echo ""
    echo "⚠️  POMEMBNO: Uredite .env datoteko z pravilnimi nastavitvami!"
    echo "nano .env"
    echo ""
    read -p "Pritisnite Enter za nadaljevanje po urejanju .env..."
fi

# Test printer
echo "🖨️  Testiram tiskalnik..."
echo ""
node test-printer.js

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Tiskalnik deluje!"
    echo ""
    echo "Če želite zagnati print server:"
    echo "  node print-server.js"
    echo ""
    echo "Za avtomatski zagon ob zagonu sistema:"
    echo "  sudo cp print-server.service /etc/systemd/system/"
    echo "  sudo systemctl daemon-reload"
    echo "  sudo systemctl enable print-server.service"
    echo "  sudo systemctl start print-server.service"
else
    echo ""
    echo "❌ Napaka pri testiranju tiskalnika!"
    echo "Preverite navodila v README.md"
fi

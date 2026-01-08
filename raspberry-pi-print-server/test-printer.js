const escpos = require('escpos');
escpos.USB = require('escpos-usb');

console.log('Testing ESC/POS printer connection...\n');

try {
  // Find USB printer device
  const device = new escpos.USB();
  
  console.log('USB device found, attempting to open...');
  
  device.open(function(error) {
    if (error) {
      console.error('Error opening device:', error);
      console.error('\nPossible solutions:');
      console.error('1. Check if printer is connected via USB');
      console.error('2. Check USB permissions (see README.md)');
      console.error('3. Run: lsusb to see connected USB devices');
      process.exit(1);
    }

    console.log('Device opened successfully!');
    console.log('Printing test receipt...\n');

    const printer = new escpos.Printer(device);

    printer
      .font('a')
      .align('ct')
      .style('bu')
      .size(1, 1)
      .text('TEST TISKANJA')
      .text('================================')
      .style('normal')
      .align('lt')
      .size(0, 0)
      .text('')
      .text('To je testni izpis')
      .text('ESC/POS Print Server')
      .text('')
      .text(`Datum: ${new Date().toLocaleString('sl-SI')}`)
      .text('')
      .text('================================')
      .text('Ce vidite ta izpis,')
      .text('je tiskalnik pravilno')
      .text('konfiguriran!')
      .text('================================')
      .text('')
      .text('')
      .cut()
      .close(() => {
        console.log('Test completed successfully!');
        console.log('Printer is ready to use.');
        process.exit(0);
      });
  });
} catch (error) {
  console.error('Error:', error.message);
  console.error('\nPossible solutions:');
  console.error('1. Install dependencies: npm install');
  console.error('2. Install system libraries: sudo apt-get install libusb-1.0-0-dev');
  console.error('3. Check if printer is ESC/POS compatible');
  process.exit(1);
}

const { io } = require('socket.io-client');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

// Configuration

const SERVER_URL = process.env.SERVER_URL || 'https://app.likanje.si'; 
const PRINTER_NAME = process.env.PRINTER_NAME || 'RaspberryPi-Store';

console.log('Starting ESC/POS Print Server...');
console.log('Server URL:', SERVER_URL);
console.log('Printer Name:', PRINTER_NAME);

// Connect to main server via WebSocket
const socket = io(SERVER_URL, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity
});

socket.onAny((event, ...args) => {
  console.log('Socket Event:', event, args);
});


socket.on('connect', () => {
  console.log('Connected to server:', socket.id);
  // Register as print client
  socket.emit('registerPrintClient', { name: PRINTER_NAME });
});

socket.on('printClientRegistered', (data) => {
  console.log('Print client registered successfully:', data.clientId);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});

// Handle print job
socket.on('print', async (data) => {
  console.log('Received print job for order:', data.order.orderNumber);
  
  try {
    await printOrder(data.order);
    socket.emit('printComplete', { orderId: data.order._id, success: true });
    console.log('Print job completed successfully');
  } catch (error) {
    console.error('Print error:', error);
    socket.emit('printComplete', { orderId: data.order._id, success: false, error: error.message });
  }
});

// ESC/POS Print Function
async function printOrder(order) {
  return new Promise((resolve, reject) => {
    try {
      // Find USB printer device
      const device = new escpos.USB();
      const printer = new escpos.Printer(device);

      device.open(function(error) {
        if (error) {
          reject(error);
          return;
        }

        try {
          printer
            .font('a')
            .align('ct')
            .style('b')
            .size(0, 0)
            .text('1AZALIKA D.O.O.')
            .text("Spodnje Pirnice 89")
            .text("1215 Medvode")
            .text('<<<<<<<<<<<<<<<<<>>>>>>>>>>>>>>>>>>>>>>')
            .style('normal')
            .align('ct')
            .text(`St. narocila: ${order.orderNumber || ''}`)
            .text(`Datum: ${formatDate(order.createdAt)}`)
            .text('---------------------------------------')
            .text(slNormalize(`Ime: ${order.name}`))
            .text(`Telefon: ${order.phone}`)
            .text(`E-posta: ${order.email || ''}`)
            .text(slNormalize(`Naslov: ${order.address || ''}`))
            .text('---------------------------------------')
            .text(slNormalize(`Prevzem: ${getPickupLabel(order.pickupMode)}`))
            .text(slNormalize(`Placilo: ${getPaymentLabel(order.paymentMethod)}`))
            .text(slNormalize(`Tip stranke: ${getCustomerTypeLabel(order.customerType)}`))
            .text(slNormalize(`Status: ${order.status}`))
            .text('=======================================');

          // Print items if available
          if (order.items && order.items.length > 0) {
            printer.text('POZICIJE:');
            printer.text('---------------------------------------');

            // Check if customer has custom articles (hide prices if true)
            const hasCustomerArticles = order.customerType === 'company' && order.customerId;

            let total = 0;
            let totalQuantity = 0;
            order.items.forEach((item, index) => {
              printer.style("b");
              printer.align("lt");
              printer.text(slNormalize(`     ${item.name}`));
              printer.align("rt");
              if (hasCustomerArticles) {
                // Only show quantity without prices
                printer.text(`Kolicina: ${item.quantity} kos     `);
                totalQuantity += item.quantity || 0;
              } else {
                // Show full price information
                printer.text(`${item.quantity} x ${item.finalPrice.toFixed(2)} EUR   ==   ${item.lineTotal.toFixed(2)} EUR     `);
              }

              total += item.lineTotal || 0;
            });
            printer.align("ct");
            printer.style("normal");
            printer.text('=======================================');

            if (hasCustomerArticles) {

              // Show total quantity if prices are hidden
              printer
                .style('b')
                .size(1, 1)
                .text(`SKUPAJ: ${totalQuantity} kos`)
                .style('normal')
                .size(0, 0);
              } else {
              // Only show total if prices are visible
              printer
               .style('b')
               .size(1, 1)
               .text(`SKUPAJ: ${total.toFixed(2)} EUR`)
               .style('normal')
               .size(0, 0);
            }
          }

          // Print order notes if available
          if (order.orderNotes) {
            printer
              .text('---------------------------------------')
              .text('OPOMBE:')
              .text(slNormalize(order.orderNotes));
          }

          // Print status history if available
          if (order.statusHistory && order.statusHistory.length > 1) {
            printer
              .text('---------------------------------------')
              .text('ZGODOVINA:');
            order.statusHistory.forEach(h => {
              printer.text(slNormalize(`${h.status} - ${formatDate(h.timestamp)}`));
            });
          }

          printer
            .text('=======================================')
            .text('')
           .text('Hvala za narocilo!')
           .text('PRIHRANITE CAS, MI LIKAMO ZA VAS!')
            .text('')
            .text('')
            .cut()
            .close(() => {
              console.log('Print job sent to printer');
              resolve();
            });

        } catch (printError) {
          reject(printError);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Helper functions
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getPickupLabel(mode) {
  return mode === 'delivery' ? 'Dostava' : 'Osebni prevzem';
}

function getPaymentLabel(method) {
  return method === 'invoice' ? 'Na racun' : 'Gotovina';
}

function getCustomerTypeLabel(type) {
  return type === 'company' ? 'Podjetje' : 'Fizicna oseba';
}


function slNormalize(text) {
  return text
    .replace(/č/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/Č/g, 'C')
    .replace(/Š/g, 'S')
    .replace(/Ž/g, 'Z');
}



// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down print server...');
  socket.disconnect();
  process.exit(0);
});

console.log('Print server is running and waiting for jobs...');

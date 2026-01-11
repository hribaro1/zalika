const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Serve archive page
app.get('/archive', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'archive.html'));
});

// Serve completed page
app.get('/completed', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'completed.html'));
});

// Serve delivery page
app.get('/delivery', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'delivery.html'));
});

// Serve customers management page
app.get('/customers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customers.html'));
});

// Serve articles management page
app.get('/articles', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'articles.html'));
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

const STATUS_OPTIONS = ["Naročeno", "Sprejeto", "V delu", "Končano", "Oddano"];

async function generateOrderNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  const prefix = `${year}-${month}-`;
  const lastOrder = await Order.findOne({
    orderNumber: { $regex: `^${prefix}` }
  }).sort({ orderNumber: -1 }).limit(1);
  
  let seq = 1;
  if (lastOrder && lastOrder.orderNumber) {
    const lastSeq = parseInt(lastOrder.orderNumber.split('-')[2]);
    seq = lastSeq + 1;
  }
  
  return `${year}-${month}-${String(seq).padStart(3, '0')}`;
}

const OrderSchema = new mongoose.Schema({
  name: String,
  service: String,
  address: String,
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  orderNotes: { type: String, default: '' },
  pickupMode: { type: String, enum: ['personal', 'delivery'], default: 'personal' },
  paymentMethod: { type: String, enum: ['cash', 'invoice'], default: 'cash' },
  customerType: { type: String, enum: ['physical', 'company'], default: 'physical' },
  status: { type: String, enum: STATUS_OPTIONS, default: "Naročeno" },
  statusHistory: [{
    status: { type: String, enum: STATUS_OPTIONS },
    timestamp: { type: Date, default: Date.now }
  }],
  orderNumber: { type: String, unique: true },
  items: [{
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' },
    name: String,
    unit: String,
    price: Number,
    vatPercent: Number,
    finalPrice: Number,
    quantity: { type: Number, min: 0, default: 1 },
    lineTotal: Number
  }]
}, { timestamps: true });

const Order = mongoose.model("Order", OrderSchema);

const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  address: { type: String },
  notes: { type: String },
  type: { type: String, enum: ['physical', 'company'], default: 'physical' },
  paymentMethod: { type: String, enum: ['cash', 'invoice'], default: 'cash' },
  pickupMode: { type: String, enum: ['personal', 'delivery'], default: 'personal' },
  usageCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

const Customer = mongoose.model('Customer', CustomerSchema);

const ArticleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  unit: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  vatPercent: { type: Number, required: true, min: 0 },
  finalPrice: { type: Number, required: true, min: 0 },
  usageCount: { type: Number, default: 0, min: 0 },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null } // null = za vse stranke
}, { timestamps: true });

ArticleSchema.pre('validate', function() {
  const p = Number(this.price);
  const v = Number(this.vatPercent);

  if (!isNaN(p) && !isNaN(v)) {
    this.price = p;
    this.vatPercent = v;
    const factor = 1 + (v / 100);
    this.finalPrice = Math.round((p * factor) * 100) / 100;
  } else {
    this.finalPrice = undefined;
  }
});

const Article = mongoose.model('Article', ArticleSchema);

const DeliveryDaySchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // YYYY-MM-DD format
  kilometers: { type: Number, default: 0, min: 0 },
  minutes: { type: Number, default: 0, min: 0 },
  orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  arrivedOrderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }], // Pripeljana naročila (status Naročeno)
  deliveredOrderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }] // Oddana naročila (status Oddano)
}, { timestamps: true });

const DeliveryDay = mongoose.model('DeliveryDay', DeliveryDaySchema);

// Track connected print clients (Raspberry Pi)
const printClients = new Map();

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  
  // Register print client (Raspberry Pi)
  socket.on('registerPrintClient', (data) => {
    printClients.set(socket.id, { socket, name: data.name || 'Unknown', timestamp: new Date() });
    console.log(`Print client registered: ${socket.id} (${data.name})`);
    socket.emit('printClientRegistered', { success: true, clientId: socket.id });
  });
  
  // Handle print request from web client
  socket.on('printOrder', async (data) => {
    console.log('Print request received for order:', data.orderId);
    
    try {
      // Get full order data from database
      const order = await Order.findById(data.orderId).lean();
      if (!order) {
        socket.emit('printError', { error: 'Order not found' });
        return;
      }
      
      // Send to all registered print clients
      let sent = false;
      for (const [clientId, client] of printClients.entries()) {
        client.socket.emit('print', { order });
        sent = true;
        console.log(`Print job sent to client: ${clientId}`);
      }
      
      if (sent) {
        socket.emit('printSuccess', { message: 'Poslano na tiskalnik' });
      } else {
        socket.emit('printError', { error: 'Ni povezanih tiskalnikov' });
      }
    } catch (err) {
      console.error('Print error:', err);
      socket.emit('printError', { error: 'Napaka pri pripravi podatkov' });
    }
  });
  
  // Handle print confirmation from print client
  socket.on('printComplete', (data) => {
    console.log('Print completed:', data);
    io.emit('printNotification', { message: 'Naročilo natisnjeno', orderId: data.orderId });
  });
  
  socket.on('disconnect', () => {
    if (printClients.has(socket.id)) {
      const client = printClients.get(socket.id);
      console.log(`Print client disconnected: ${socket.id} (${client.name})`);
      printClients.delete(socket.id);
    } else {
      console.log('Socket disconnected:', socket.id);
    }
  });
});

// Customers API
app.get('/api/customers', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: 1 }).lean();
    res.json(customers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    io.emit('customerCreated', customer);
    res.status(201).json({ message: 'Customer created', customer });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to create customer' });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    io.emit('customerUpdated', customer);
    res.json({ message: 'Customer updated', customer });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to update customer' });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    io.emit('customerDeleted', { _id: req.params.id });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Articles API
app.get('/api/articles', async (req, res) => {
  try {
    const articles = await Article.find().sort({ createdAt: 1 }).lean();
    res.json(articles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

app.post('/api/articles', async (req, res) => {
  try {
    const article = new Article(req.body);
    await article.save();
    io.emit('articleCreated', article);
    res.status(201).json({ message: 'Article created', article });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to create article' });
  }
});

app.put('/api/articles/:id', async (req, res) => {
  try {
    const updates = req.body;
    let article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article not found' });
    article.set(updates);
    await article.save();
    io.emit('articleUpdated', article);
    res.json({ message: 'Article updated', article });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to update article' });
  }
});

app.delete('/api/articles/:id', async (req, res) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article not found' });
    io.emit('articleDeleted', { _id: req.params.id });
    res.json({ message: 'Article deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/order", async (req, res) => {
  try {
    const order = new Order(req.body);
    order.orderNumber = await generateOrderNumber();
    order.statusHistory = [{ status: order.status, timestamp: new Date() }];
    await order.save();
    
    // Increment customer usage count if customerId is provided
    if (order.customerId) {
      await Customer.findByIdAndUpdate(order.customerId, { $inc: { usageCount: 1 } });
    }
    
    io.emit('orderCreated', order);
    res.json({ message: "Order placed!", order });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to place order" });
  }
});

app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find({status: {$nin: ["Oddano", "Končano"]}}).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

app.get("/order/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

app.get("/api/archive", async (req, res) => {
  try {
    const orders = await Order.find({status: "Oddano"}).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch archived orders" });
  }
});

app.get("/api/completed", async (req, res) => {
  try {
    const orders = await Order.find({status: {$in: ["Končano", "Oddano"]}}).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch completed orders" });
  }
});

app.get("/api/delivery", async (req, res) => {
  try {
    // Return all delivery orders, including completed ones
    const orders = await Order.find({
      pickupMode: "delivery"
    }).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch delivery orders" });
  }
});

app.put("/order/:id", async (req, res) => {
  try {
    const updates = req.body;

    if (updates.status && !STATUS_OPTIONS.includes(updates.status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    if (Array.isArray(updates.items)) {
      const resolvedItems = [];
      const articlesToIncrement = new Set(); // Track which articles to increment
      
      for (const it of updates.items) {
        if (!it.articleId) continue;
        const art = await Article.findById(it.articleId).lean();
        if (!art) continue;
        const qty = typeof it.quantity === 'number' ? it.quantity : (Number(it.quantity) || 1);
        const finalPrice = Number(art.finalPrice) || 0;
        const lineTotal = Math.round(finalPrice * qty * 100) / 100;
        resolvedItems.push({
          articleId: art._id,
          name: art.name,
          unit: art.unit,
          price: art.price,
          vatPercent: art.vatPercent,
          finalPrice,
          quantity: qty,
          lineTotal
        });
        
        // Increment usage count if quantity is not 0
        if (qty !== 0) {
          articlesToIncrement.add(art._id.toString());
        }
      }
      
      // Get the order to compare with previous items
      const order = await Order.findById(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      
      // Find articles that are new (not in previous items with non-zero quantity)
      const previousArticleIds = new Set();
      if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
          if (item.quantity !== 0 && item.articleId) {
            previousArticleIds.add(item.articleId.toString());
          }
        });
      }
      
      // Increment usage count only for new articles
      for (const articleId of articlesToIncrement) {
        if (!previousArticleIds.has(articleId)) {
          await Article.findByIdAndUpdate(articleId, { $inc: { usageCount: 1 } });
        }
      }
      
      updates.items = resolvedItems;
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (updates.status && (!order.statusHistory || order.statusHistory.length === 0)) {
      order.statusHistory = [{ status: order.status, timestamp: order.createdAt }];
    }

    const allowed = ['name','service','address','email','phone','status','items','paymentMethod','customerType','pickupMode','orderNotes'];
    allowed.forEach(k => { if (typeof updates[k] !== 'undefined') order[k] = updates[k]; });

    if (updates.status && updates.status !== order.status) {
      order.statusHistory.push({ status: updates.status, timestamp: new Date() });
    }

    await order.save();
    io.emit('orderUpdated', order);
    res.json({ message: "Order updated", order });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to update order" });
  }
});

app.patch("/order/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUS_OPTIONS.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (!order.statusHistory || order.statusHistory.length === 0) {
      order.statusHistory = [{ status: order.status, timestamp: order.createdAt }];
    }

    if (status !== order.status) {
      order.statusHistory.push({ status, timestamp: new Date() });
      order.status = status;
    }

    await order.save();
    io.emit('orderUpdated', order);
    res.json({ message: "Status updated", order });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to update status" });
  }
});

app.delete("/order/:id", async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    io.emit('orderDeleted', { id: req.params.id });
    res.json({ message: "Order deleted", order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete order" });
  }
});

// DeliveryDay API endpoints
app.get("/api/delivery-days", async (req, res) => {
  try {
    const deliveryDays = await DeliveryDay.find().sort({ date: -1 }).lean();
    res.json(deliveryDays);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch delivery days" });
  }
});

app.get("/api/delivery-day/:date", async (req, res) => {
  try {
    const deliveryDay = await DeliveryDay.findOne({ date: req.params.date }).lean();
    if (!deliveryDay) return res.json({ date: req.params.date, kilometers: 0, minutes: 0, orderIds: [], arrivedOrderIds: [], deliveredOrderIds: [] });
    res.json(deliveryDay);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch delivery day" });
  }
});

app.post("/api/delivery-day", async (req, res) => {
  try {
    const { date, kilometers, minutes, orderIds, arrivedOrderIds, deliveredOrderIds } = req.body;
    
    // Find or create delivery day
    let deliveryDay = await DeliveryDay.findOne({ date });
    
    if (deliveryDay) {
      deliveryDay.kilometers = kilometers;
      deliveryDay.minutes = minutes;
      deliveryDay.orderIds = orderIds || [];
      deliveryDay.arrivedOrderIds = arrivedOrderIds || [];
      deliveryDay.deliveredOrderIds = deliveredOrderIds || [];
      await deliveryDay.save();
    } else {
      deliveryDay = new DeliveryDay({
        date,
        kilometers,
        minutes,
        orderIds: orderIds || [],
        arrivedOrderIds: arrivedOrderIds || [],
        deliveredOrderIds: deliveredOrderIds || []
      });
      await deliveryDay.save();
    }
    
    res.json({ message: "Delivery day saved", deliveryDay });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to save delivery day" });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


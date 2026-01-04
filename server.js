const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
require("dotenv").config();

const app = express();
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

const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

const STATUS_OPTIONS = ["Naročeno", "Sprejeto", "V delu", "Končano", "Oddano"];

async function generateOrderNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  // Find the highest order number for current month
  const prefix = `${year}-${month}-`;
  const lastOrder = await Order.findOne({
    orderNumber: { $regex: `^${prefix}` }
  }).sort({ orderNumber: -1 }).limit(1);
  
  let seq = 1;
  if (lastOrder && lastOrder.orderNumber) {
    // Extract sequence number from last order
    const lastSeq = parseInt(lastOrder.orderNumber.split('-')[2]);
    seq = lastSeq + 1;
  }
  
  return `${year}-${month}-${String(seq).padStart(3, '0')}`;
}

// --- Orders schema (z dodatkom items) ---
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
    price: Number,       // net price
    vatPercent: Number,
    finalPrice: Number,  // price with VAT
    quantity: { type: Number, min: 1, default: 1 },
    lineTotal: Number    // finalPrice * quantity
  }]
}, { timestamps: true });

const Order = mongoose.model("Order", OrderSchema);

// --- Customers (stranke) model + API ---
const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  address: { type: String },
  notes: { type: String },
  type: { type: String, enum: ['physical', 'company'], default: 'physical' },
  paymentMethod: { type: String, enum: ['cash', 'invoice'], default: 'cash' }
}, { timestamps: true });

const Customer = mongoose.model('Customer', CustomerSchema);

// --- Articles (artikli) model + API ---
const ArticleSchema = new mongoose.Schema({
  name: { type: String, required: true },              // naziv
  unit: { type: String, required: true },              // enota mere
  price: { type: Number, required: true, min: 0 },     // osnovna cena (neto)
  vatPercent: { type: Number, required: true, min: 0 },// DDV %
  finalPrice: { type: Number, required: true, min: 0 } // cena z DDV
}, { timestamps: true });

// pre-validate: coerce price/vatPercent to Number and compute finalPrice
// NOTE: use synchronous hook without 'next' to avoid "next is not a function" errors
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

// Socket.IO: basic connect logging
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.on('disconnect', () => console.log('Socket disconnected:', socket.id));
});

// Serve customers management page (explicit route)
app.get('/customers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customers.html'));
});

// Serve articles management page
app.get('/articles', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'articles.html'));
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

// Homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Create order
app.post("/order", async (req, res) => {
  try {
    const order = new Order(req.body);
    order.orderNumber = await generateOrderNumber();
    order.statusHistory = [{ status: order.status, timestamp: new Date() }];
    await order.save();
    io.emit('orderCreated', order);
    res.json({ message: "Order placed!", order });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to place order" });
  }
});

// List orders (most recent first, excluding archived and completed)
app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find({status: {$nin: ["Oddano", "Končano"]}}).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// List archived orders
app.get("/api/archive", async (req, res) => {
  try {
    const orders = await Order.find({status: "Oddano"}).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch archived orders" });
  }
});

// List completed orders
app.get("/api/completed", async (req, res) => {
  try {
    const orders = await Order.find({status: "Končano"}).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch completed orders" });
  }
});

// Update whole order (name, email, phone, address, service, status, items)
// Replace the previous app.put("/order/:id", ...) with the safer version below:
app.put("/order/:id", async (req, res) => {
  try {
    const updates = req.body;

    // validate status if provided
    if (updates.status && !STATUS_OPTIONS.includes(updates.status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    // If items are provided, compute canonical item fields (name, finalPrice, lineTotal) from Article records
    if (Array.isArray(updates.items)) {
      const resolvedItems = [];
      for (const it of updates.items) {
        // expecting it.articleId and it.quantity
        if (!it.articleId) {
          // If articleId missing, skip or accept a custom item if you want; here we'll skip
          continue;
        }
        const art = await Article.findById(it.articleId).lean();
        if (!art) continue;
        const qty = Number(it.quantity) || 1;
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
      }
      updates.items = resolvedItems;
    }

    // apply updates using findById to ensure full document validators and hooks run predictably
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // If updating status and no history, initialize
    if (updates.status && (!order.statusHistory || order.statusHistory.length === 0)) {
      order.statusHistory = [{ status: order.status, timestamp: order.createdAt }];
    }

    // set provided top-level fields
    const allowed = ['name','service','address','email','phone','status','items','paymentMethod','customerType','pickupMode'];
    allowed.forEach(k => { if (typeof updates[k] !== 'undefined') order[k] = updates[k]; });

    // If status changed, add to history
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

// Update only status (use findByIdAndUpdate without runValidators to avoid failing due to other missing fields)
app.patch("/order/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUS_OPTIONS.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Initialize history if missing
    if (!order.statusHistory || order.statusHistory.length === 0) {
      order.statusHistory = [{ status: order.status, timestamp: order.createdAt }];
    }

    // Add to history if status changed
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

// Delete order
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


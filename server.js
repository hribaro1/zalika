const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

const STATUS_OPTIONS = ["Naročeno", "Sprejeto", "V delu", "Končano", "Oddano"];

const OrderSchema = new mongoose.Schema({
  name: String,
  service: String,
  address: String,
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: [/.+@.+\..+/, 'Please enter a valid email address']
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    match: [/^[+\d\s\-().]{6,20}$/, 'Please enter a valid phone number']
  },
  status: { type: String, enum: STATUS_OPTIONS, default: "Naročeno" }
}, { timestamps: true });

const Order = mongoose.model("Order", OrderSchema);

// Customer model for managing clients (stranke)
const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, trim: true, lowercase: true, match: [/.+@.+\..+/, 'Please enter a valid email address'] },
  phone: { type: String, required: true, trim: true, match: [/^[+\d\s\-().]{6,20}$/, 'Please enter a valid phone number'] },
  address: { type: String },
  notes: { type: String }
}, { timestamps: true });

const Customer = mongoose.model("Customer", CustomerSchema);

// Serve customers management page
app.get('/customers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customers.html'));
});

// API: list customers
app.get('/api/customers', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 }).lean();
    res.json(customers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// API: create customer
app.post('/api/customers', async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    res.status(201).json({ message: 'Customer created', customer });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to create customer' });
  }
});

// API: update customer
app.put('/api/customers/:id', async (req, res) => {
  try {
    const updates = req.body;
    const customer = await Customer.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer updated', customer });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to update customer' });
  }
});

// API: delete customer
app.delete('/api/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete customer' });
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
    await order.save();
    res.json({ message: "Order placed!", order });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to place order" });
  }
});

// List orders (most recent first)
app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Update whole order (name, email, phone, address, service, status)
app.put("/order/:id", async (req, res) => {
  try {
    const updates = req.body;
    if (updates.status && !STATUS_OPTIONS.includes(updates.status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    const order = await Order.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({ message: "Order updated", order });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to update order" });
  }
});

// Update only status
app.patch("/order/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUS_OPTIONS.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true });
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({ message: "Status updated", order });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to update status" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


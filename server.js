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
  status: { type: String, default: "Pending" }
});

const Order = mongoose.model("Order", OrderSchema);

// Optional: homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


app.post("/order", async (req, res) => {
  const order = new Order(req.body);
  await order.save();
  res.json({ message: "Order placed!", order });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


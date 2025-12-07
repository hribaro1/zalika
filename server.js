const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(express.json());

const path = require("path");
app.use(express.static(path.join(__dirname, "public")));


mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

const OrderSchema = new mongoose.Schema({
  name: String,
  service: String,
  address: String,
  status: { type: String, default: "Pending" }
});

const Order = mongoose.model("Order", OrderSchema);

app.get("/", (req, res) => {
  res.send("Laundry App API is running");
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


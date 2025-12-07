<!DOCTYPE html>
<html>
<head>
  <title>Laundry Service</title>
</head>
<body>
  <h1>Laundry Booking</h1>

  <input id="name" placeholder="Your Name" />
  <input id="address" placeholder="Your Address" />
  
  <select id="service">
    <option>Dry Cleaning</option>
    <option>Wash & Fold</option>
    <option>Ironing</option>
  </select>

  <button onclick="order()">Place Order</button>

  <script>
    function order() {
      fetch("/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: document.getElementById("name").value,
          address: document.getElementById("address").value,
          service: document.getElementById("service").value
        })
      })
      .then(res => res.json())
      .then(data => alert(data.message));
    }
  </script>
</body>
</html>


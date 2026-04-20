const express = require("express");
const fetch = require("node-fetch");

const app = express();

const BASE_URL = "https://scheduling-dd672-default-rtdb.asia-southeast1.firebasedatabase.app";

app.get("/", (req, res) => {
  res.json({
    message: "API is running",
    endpoints: ["/api/mes-schedule"]
  });
});

app.get("/api/mes-schedule", async (req, res) => {
  try {
    const [scheduleRes, mesRes] = await Promise.all([
      fetch(`${BASE_URL}/schedule.json`),
      fetch(`${BASE_URL}/mes/requisitionTickets.json`)
    ]);

    const schedule = await scheduleRes.json();
    const mes = await mesRes.json();

    const scheduleList = Object.values(schedule || {});
    const mesList = Object.values(mes || {});

    // ✅ OR 条件
    const filteredMes = mesList.filter(item =>
      item.changeMode === "expedite" ||
      item.type === "after-signed-off-change"
    );

    const result = filteredMes.map(m => {
      const sch = scheduleList.find(s => s.Chassis === m.chassis);

      return {
        chassis: m.chassis,
        Dealer: sch?.Dealer || null,
        SignedPlansReceived: sch?.["Signed Plans Received"] || null,
        RegentProduction: sch?.["Regent Production"] || null,
        changeMode: m.changeMode,
        type: m.type
      };
    });

    res.json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: "Use /api/mes-schedule"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("API running");
});

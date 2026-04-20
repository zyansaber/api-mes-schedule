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

    const scheduleList = Object.values(schedule || {})
      .filter(item => item && item.Chassis);

    const mesList = Object.values(mes || {}).filter(Boolean);

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

const getByIdOrIndex = (collection, id) => {
  if (!collection) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(collection, id)) {
    return { id, ...collection[id] };
  }

  const index = Number(id);
  if (!Number.isNaN(index) && Number.isInteger(index) && index >= 0) {
    const entries = Object.entries(collection);
    const entry = entries[index];
    if (entry) {
      const [entryId, payload] = entry;
      return { id: entryId, ...payload };
    }
  }

  return null;
};

app.get("/schedule/:id", async (req, res) => {
  try {
    const response = await fetch(`${BASE_URL}/schedule.json`);
    const schedule = await response.json();
    const item = getByIdOrIndex(schedule, req.params.id);

    if (!item) {
      return res.status(404).json({
        error: "Not Found",
        message: `No schedule record found for id/index '${req.params.id}'`
      });
    }

    return res.json(item);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/mes/requisitionTickets/:id", async (req, res) => {
  try {
    const response = await fetch(`${BASE_URL}/mes/requisitionTickets.json`);
    const tickets = await response.json();
    const item = getByIdOrIndex(tickets, req.params.id);

    if (!item) {
      return res.status(404).json({
        error: "Not Found",
        message: `No requisition ticket found for id/index '${req.params.id}'`
      });
    }

    return res.json(item);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: "Use /api/mes-schedule, /schedule/:id or /mes/requisitionTickets/:id"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("API running");
});

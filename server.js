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

    const scheduleList = Object.entries(schedule || {}).map(([id, item]) => ({
      id,
      ...item
    }));
    const requisitionTickets = Object.entries(mes || {}).map(([id, item]) => ({
      id,
      ...item
    }));

    res.json({
      schedule: scheduleList,
      requisitionTickets
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/schedule/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const directResponse = await fetch(`${BASE_URL}/schedule/${encodeURIComponent(id)}.json`);

    if (!directResponse.ok) {
      return res.status(directResponse.status).json({
        error: "Upstream Error",
        message: `Failed to fetch schedule/${id}`,
        status: directResponse.status
      });
    }

    const directItem = await directResponse.json();
    if (directItem) {
      return res.json({ id, ...directItem });
    }

    const index = Number(id);
    if (!Number.isNaN(index) && Number.isInteger(index) && index >= 0) {
      const response = await fetch(`${BASE_URL}/schedule.json`);
      if (!response.ok) {
        return res.status(response.status).json({
          error: "Upstream Error",
          message: "Failed to fetch schedule list for index lookup",
          status: response.status
        });
      }

      const schedule = await response.json();
      const entry = Object.entries(schedule || {})[index];
      if (entry) {
        const [resolvedId, item] = entry;
        return res.json({ id: resolvedId, ...item });
      }
    }

    return res.status(404).json({
      error: "Not Found",
      message: `No schedule record found for id/index '${id}'`
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/mes/requisitionTickets/:id", async (req, res) => {
  try {
    const response = await fetch(`${BASE_URL}/mes/requisitionTickets/${encodeURIComponent(req.params.id)}.json`);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Upstream Error",
        message: `Failed to fetch mes/requisitionTickets/${req.params.id}`,
        status: response.status
      });
    }

    const item = await response.json();
    if (!item) {
      return res.status(404).json({
        error: "Not Found",
        message: `No requisition ticket found for id '${req.params.id}'`
      });
    }

    return res.json({ id: req.params.id, ...item });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: "Use /api/mes-schedule, /schedule/:id, or /mes/requisitionTickets/:id"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("API running");
});

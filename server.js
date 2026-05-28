const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();

const allowedOrigins = [
  "http://localhost:4200",
  "https://snowyapp.com.au"
];

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
app.options("*", cors());

const BASE_URL = "https://scheduling-dd672-default-rtdb.asia-southeast1.firebasedatabase.app";

const mapRequisitionTicket = (id, item) => ({
  id,
  chassis: item.chassis || null,
  partNumber: item.partNumber || null,
  changeMode: item.changeMode || null,
  type: item.type || null,
  status: item.status || null
});

const mapCampervanScheduleItem = (item) => ({
  Chassis: item.chassisNumber || null,
  Dealer: item.dealer || null,
  Customer: item.customer || null,
  Model: item.model || null,
  ModelYear: item.modelYear || null,
  ForecastProductionDate: item.forecastProductionDate || null,
  VinNumber: item.vinNumber || null
});

app.get("/", (req, res) => {
  res.json({
    message: "API is running",
    endpoints: ["/api", "/api/mes-schedule", "/api/mes-schedule/:chassis", "/schedule/:id", "/mes/requisitionTickets/:id"]
  });
});

app.get("/api", (req, res) => {
  res.json({
    message: "Firebase API is running",
    baseUrl: "https://firebase-api-2mx9.onrender.com/api",
    endpoints: ["/api/mes-schedule", "/api/mes-schedule/:chassis", "/schedule/:id", "/mes/requisitionTickets/:id"]
  });
});

app.get("/api/mes-schedule", async (req, res) => {
  try {
    const [scheduleRes, campervanScheduleRes, ticketsRes] = await Promise.all([
      fetch(`${BASE_URL}/schedule.json`),
      fetch(`${BASE_URL}/campervanSchedule.json`),
      fetch(`${BASE_URL}/mes/requisitionTickets.json`)
    ]);

    if (!scheduleRes.ok) {
      return res.status(scheduleRes.status).json({
        error: "Upstream Error",
        message: "Failed to fetch schedule",
        status: scheduleRes.status
      });
    }
    if (!ticketsRes.ok) {
      return res.status(ticketsRes.status).json({
        error: "Upstream Error",
        message: "Failed to fetch mes/requisitionTickets",
        status: ticketsRes.status
      });
    }
    if (!campervanScheduleRes.ok) {
      return res.status(campervanScheduleRes.status).json({
        error: "Upstream Error",
        message: "Failed to fetch campervanSchedule",
        status: campervanScheduleRes.status
      });
    }

    const schedule = await scheduleRes.json();
    const campervanSchedule = await campervanScheduleRes.json();
    const tickets = await ticketsRes.json();
    const thresholdDate = new Date(Date.UTC(2026, 2, 23)); // 23/03/2026
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const parseDdMmYyyy = (value) => {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || "").trim());
      if (!match) {
        return null;
      }
      const [, dd, mm, yyyy] = match;
      return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    };

    const scheduleList = Object.values(schedule || {})
      .filter(Boolean)
      .filter((item) => {
        const signedPlans = String(item["Signed Plans Received"] || "").trim();
        const regentProduction = String(item["Regent Production"] || "").trim().toLowerCase();
        return signedPlans && signedPlans.toLowerCase() !== "no" && regentProduction !== "finished";
      })
      .map((item) => {
        const signedPlansDate = parseDdMmYyyy(item["Signed Plans Received"]);
        const customer = String(item.Customer || "").trim();
        const isStockEnding = /stock$/i.test(customer);
        const isAfterThreshold = Boolean(signedPlansDate && signedPlansDate > thresholdDate);
        const aging = signedPlansDate
          ? Math.floor((todayUtc.getTime() - signedPlansDate.getTime()) / (24 * 60 * 60 * 1000))
          : null;

        return {
          Chassis: item.Chassis || null,
          Dealer: item.Dealer || null,
          Customer: item.Customer || null,
          Model: item.Model || null,
          ModelYear: item["Model Year"] || null,
          ForecastProductionDate: item["Forecast Production Date"] || null,
          SignedPlansReceived: item["Signed Plans Received"] || null,
          RegentProduction: item["Regent Production"] || null,
          aging,
          "140daysplan": isAfterThreshold && !isStockEnding
        };
      });

    const campervanScheduleList = Object.values(campervanSchedule || {})
      .filter(Boolean)
      .map((item) => mapCampervanScheduleItem(item));

    const requisitionTickets = Object.entries(tickets || {})
      .filter(([, item]) =>
        item &&
        (item.changeMode === "expedite" || item.type === "after-signed-off-change")
      )
      .map(([id, item]) => mapRequisitionTicket(id, item));

    return res.json({
      schedule: scheduleList,
      campervanSchedule: campervanScheduleList,
      requisitionTickets
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/mes-schedule/:chassis", async (req, res) => {
  try {
    const chassis = String(req.params.chassis || "").trim();
    if (!chassis) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Chassis is required"
      });
    }

    const [scheduleRes, campervanScheduleRes, ticketsRes] = await Promise.all([
      fetch(`${BASE_URL}/schedule.json`),
      fetch(`${BASE_URL}/campervanSchedule.json`),
      fetch(`${BASE_URL}/mes/requisitionTickets.json`)
    ]);

    if (!scheduleRes.ok) {
      return res.status(scheduleRes.status).json({
        error: "Upstream Error",
        message: "Failed to fetch schedule",
        status: scheduleRes.status
      });
    }
    if (!ticketsRes.ok) {
      return res.status(ticketsRes.status).json({
        error: "Upstream Error",
        message: "Failed to fetch mes/requisitionTickets",
        status: ticketsRes.status
      });
    }
    if (!campervanScheduleRes.ok) {
      return res.status(campervanScheduleRes.status).json({
        error: "Upstream Error",
        message: "Failed to fetch campervanSchedule",
        status: campervanScheduleRes.status
      });
    }

    const schedule = await scheduleRes.json();
    const campervanSchedule = await campervanScheduleRes.json();
    const tickets = await ticketsRes.json();

    const chassisLower = chassis.toLowerCase();
    const thresholdDate = new Date(Date.UTC(2026, 2, 23)); // 23/03/2026
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const parseDdMmYyyy = (value) => {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || "").trim());
      if (!match) {
        return null;
      }
      const [, dd, mm, yyyy] = match;
      return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    };

    const scheduleMatches = Object.values(schedule || {})
      .filter(Boolean)
      .filter((item) => String(item.Chassis || "").trim().toLowerCase() === chassisLower)
      .filter((item) => {
        const signedPlans = String(item["Signed Plans Received"] || "").trim();
        const regentProduction = String(item["Regent Production"] || "").trim().toLowerCase();
        return signedPlans && signedPlans.toLowerCase() !== "no" && regentProduction !== "finished";
      })
      .map((item) => {
        const signedPlansDate = parseDdMmYyyy(item["Signed Plans Received"]);
        const customer = String(item.Customer || "").trim();
        const isStockEnding = /stock$/i.test(customer);
        const isAfterThreshold = Boolean(signedPlansDate && signedPlansDate > thresholdDate);
        const aging = signedPlansDate
          ? Math.floor((todayUtc.getTime() - signedPlansDate.getTime()) / (24 * 60 * 60 * 1000))
          : null;

        return {
          Chassis: item.Chassis || null,
          Dealer: item.Dealer || null,
          Customer: item.Customer || null,
          Model: item.Model || null,
          ModelYear: item["Model Year"] || null,
          ForecastProductionDate: item["Forecast Production Date"] || null,
          SignedPlansReceived: item["Signed Plans Received"] || null,
          RegentProduction: item["Regent Production"] || null,
          aging,
          "140daysplan": isAfterThreshold && !isStockEnding
        };
      });

    const campervanScheduleMatches = Object.values(campervanSchedule || {})
      .filter(Boolean)
      .filter((item) => String(item.chassisNumber || "").trim().toLowerCase() === chassisLower)
      .map((item) => mapCampervanScheduleItem(item));

    const requisitionTicketMatches = Object.entries(tickets || {})
      .filter(([, item]) =>
        item &&
        String(item.chassis || "").trim().toLowerCase() === chassisLower &&
        (item.changeMode === "expedite" || item.type === "after-signed-off-change")
      )
      .map(([id, item]) => mapRequisitionTicket(id, item));

    if (!scheduleMatches.length && !campervanScheduleMatches.length && !requisitionTicketMatches.length) {
      return res.status(404).json({
        error: "Not Found",
        message: `No data found for chassis '${chassis}'`
      });
    }

    const effectiveSchedule = scheduleMatches.length ? scheduleMatches : campervanScheduleMatches;

    return res.json({
      chassis,
      schedule: effectiveSchedule,
      requisitionTickets: requisitionTicketMatches
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
    message: "Use /api/mes-schedule, /api/mes-schedule/:chassis, /schedule/:id, or /mes/requisitionTickets/:id"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("API running");
});

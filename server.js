const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const crypto = require("crypto");

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
const GREENRV_DEALERS = new Set(["green show", "slacks creek", "forest glen"]);
const GREENRV_ENCRYPTION_KEY = process.env.GREENRV_API_ENCRYPTION_KEY || "";

const shouldEncryptGreenRvResponse = (req) => {
  const queryValue = String(req.query.encrypt || "").trim().toLowerCase();
  const headerValue = String(req.get("x-encrypt-response") || "").trim().toLowerCase();
  return [queryValue, headerValue].some((value) => value === "true" || value === "1" || value === "yes");
};

const getGreenRvEncryptionKey = () => {
  if (!GREENRV_ENCRYPTION_KEY) {
    return null;
  }
  return crypto.createHash("sha256").update(GREENRV_ENCRYPTION_KEY).digest();
};

const encryptJsonPayload = (payload) => {
  const key = getGreenRvEncryptionKey();
  if (!key) {
    throw new Error("GREENRV_API_ENCRYPTION_KEY is required for encrypted responses");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: true,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    data: encrypted.toString("base64")
  };
};

const sendGreenRvResponse = (req, res, payload) => {
  if (!shouldEncryptGreenRvResponse(req)) {
    return res.json(payload);
  }

  try {
    return res.json(encryptJsonPayload(payload));
  } catch (error) {
    return res.status(500).json({
      error: "Encryption Error",
      message: error.message
    });
  }
};

const mapRequisitionTicket = (id, item) => ({
  id,
  chassis: item.chassis || null,
  partNumber: item.partNumber || null,
  changeMode: item.changeMode || null,
  type: item.type || null,
  status: item.status || null
});


const normalizeDealerStockLevel = (value) => {
  const level = String(value || "").trim().toLowerCase();
  if (level === "less" || level === "over") {
    return level;
  }
  return "normal";
};

const buildDealerStockLevelMap = (dealerStockLevels) => {
  return Object.entries(dealerStockLevels || {}).reduce((acc, [dealer, level]) => {
    acc[String(dealer || "").trim().toLowerCase()] = normalizeDealerStockLevel(level);
    return acc;
  }, {});
};

const getDealerStockLevel = (dealer, dealerStockLevelMap) => {
  const dealerKey = String(dealer || "").trim().toLowerCase();
  if (!dealerKey) {
    return "normal";
  }
  return dealerStockLevelMap[dealerKey] || "normal";
};

const getCustomerType = (customer) => {
  const normalizedCustomer = String(customer || "").trim().toLowerCase();
  if (normalizedCustomer.includes("prototype")) {
    return "prototype";
  }
  if (normalizedCustomer.endsWith("stock")) {
    return "stock";
  }
  return "customer";
};
const mapCampervanScheduleItem = (item) => ({
  Chassis: item.chassisNumber || null,
  Dealer: item.dealer || null,
  Customer: item.customer || null,
  Model: item.model || null,
  ModelYear: item.modelYear || null,
  ForecastProductionDate: item.forecastProductionDate || null,
  VinNumber: item.vinNumber || null,
  customerType: getCustomerType(item.customer)
});

const mapGreenRvScheduleItem = (item) => ({
  Chassis: item.Chassis || null,
  Customer: item.Customer || null,
  Dealer: item.Dealer || null,
  "Forecast Production Date": item["Forecast Production Date"] || null,
  Model: item.Model || null,
  "Model Year": item["Model Year"] || null,
  "Order Received Date": item["Order Received Date"] || null,
  "Regent Production": item["Regent Production"] || null,
  Shipment: item.Shipment || null,
  "Signed Plans Received": item["Signed Plans Received"] || null,
  "production status": item["Vin Number"] || null
});

app.get("/", (req, res) => {
  res.json({
    message: "API is running",
    endpoints: ["/api", "/api/mes-schedule", "/api/mes-schedule/:chassis", "/greenrv/schedulingapi", "/schedule/:id", "/mes/requisitionTickets/:id"]
  });
});

app.get("/api", (req, res) => {
  res.json({
    message: "Firebase API is running",
    baseUrl: "https://firebase-api-2mx9.onrender.com/api",
    endpoints: ["/api/mes-schedule", "/api/mes-schedule/:chassis", "/greenrv/schedulingapi", "/schedule/:id", "/mes/requisitionTickets/:id"]
  });
});


app.get("/greenrv/schedulingapi", async (req, res) => {
  try {
    const response = await fetch(`${BASE_URL}/schedule.json`);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Upstream Error",
        message: "Failed to fetch schedule",
        status: response.status
      });
    }

    const schedule = await response.json();
    const orders = Object.values(schedule || {})
      .filter(Boolean)
      .filter((item) => GREENRV_DEALERS.has(String(item.Dealer || "").trim().toLowerCase()))
      .map((item) => mapGreenRvScheduleItem(item));

    return sendGreenRvResponse(req, res, {
      orders,
      orderCount: orders.length,
      dealers: Array.from(GREENRV_DEALERS)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/mes-schedule", async (req, res) => {
  try {
    const [scheduleRes, campervanScheduleRes, ticketsRes, dealerStockLevelsRes] = await Promise.all([
      fetch(`${BASE_URL}/schedule.json`),
      fetch(`${BASE_URL}/campervanSchedule.json`),
      fetch(`${BASE_URL}/mes/requisitionTickets.json`),
      fetch(`${BASE_URL}/scheduleDealerStockLevels.json`)
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
    if (!dealerStockLevelsRes.ok) {
      return res.status(dealerStockLevelsRes.status).json({
        error: "Upstream Error",
        message: "Failed to fetch scheduleDealerStockLevels",
        status: dealerStockLevelsRes.status
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
    const dealerStockLevels = await dealerStockLevelsRes.json();
    const dealerStockLevelMap = buildDealerStockLevelMap(dealerStockLevels);
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
          "140daysplan": isAfterThreshold && !isStockEnding,
          dealerStockLevel: getDealerStockLevel(item.Dealer, dealerStockLevelMap),
          customerType: getCustomerType(item.Customer)
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

    const [scheduleRes, campervanScheduleRes, ticketsRes, dealerStockLevelsRes] = await Promise.all([
      fetch(`${BASE_URL}/schedule.json`),
      fetch(`${BASE_URL}/campervanSchedule.json`),
      fetch(`${BASE_URL}/mes/requisitionTickets.json`),
      fetch(`${BASE_URL}/scheduleDealerStockLevels.json`)
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
    if (!dealerStockLevelsRes.ok) {
      return res.status(dealerStockLevelsRes.status).json({
        error: "Upstream Error",
        message: "Failed to fetch scheduleDealerStockLevels",
        status: dealerStockLevelsRes.status
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
    const dealerStockLevels = await dealerStockLevelsRes.json();
    const dealerStockLevelMap = buildDealerStockLevelMap(dealerStockLevels);

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
          "140daysplan": isAfterThreshold && !isStockEnding,
          dealerStockLevel: getDealerStockLevel(item.Dealer, dealerStockLevelMap),
          customerType: getCustomerType(item.Customer)
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
    message: "Use /api/mes-schedule, /api/mes-schedule/:chassis, /greenrv/schedulingapi, /schedule/:id, or /mes/requisitionTickets/:id"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("API running");
});

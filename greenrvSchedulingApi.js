const crypto = require("crypto");

const GREENRV_DEALERS = new Set(["green show", "slacks creek", "forest glen", "heatherbrae", "toowoomba", "bundaberg"]);

const getGreenRvConfig = () => ({
  apiKey: process.env.GREENRV_SCHEDULING_API_KEY || "",
  encryptionKey: process.env.GREENRV_API_ENCRYPTION_KEY || ""
});

const getBearerToken = (authorizationHeader) => {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorizationHeader || "").trim());
  return match ? match[1].trim() : "";
};

const constantTimeEquals = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const authorizeGreenRvRequest = (req, res) => {
  const { apiKey, encryptionKey } = getGreenRvConfig();

  if (!apiKey || !encryptionKey) {
    res.status(503).json({
      error: "Service Unavailable",
      message: "Green RV scheduling API requires GREENRV_SCHEDULING_API_KEY and GREENRV_API_ENCRYPTION_KEY"
    });
    return false;
  }

  const suppliedKey = String(req.get("x-api-key") || getBearerToken(req.get("authorization")) || "").trim();
  if (!constantTimeEquals(suppliedKey, apiKey)) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Valid x-api-key or Authorization Bearer token is required"
    });
    return false;
  }

  return true;
};

const getGreenRvEncryptionKey = () => {
  const { encryptionKey } = getGreenRvConfig();
  if (!encryptionKey) {
    return null;
  }
  return crypto.createHash("sha256").update(encryptionKey).digest();
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

const sendEncryptedGreenRvResponse = (res, payload) => {
  try {
    return res.json(encryptJsonPayload(payload));
  } catch (error) {
    return res.status(500).json({
      error: "Encryption Error",
      message: error.message
    });
  }
};

const formatProductionStatus = (value) => {
  const productionStatus = String(value || "").trim();
  if (!productionStatus) {
    return null;
  }
  if (/^\d+$/.test(productionStatus)) {
    return `Longtree Production: ${productionStatus}`;
  }
  return productionStatus;
};

const getSpecPlanForChassis = (specPlan, chassis) => {
  const chassisKey = String(chassis || "").trim();
  if (!chassisKey) {
    return {};
  }

  return specPlan[chassisKey] || specPlan[chassisKey.toUpperCase()] || specPlan[chassisKey.toLowerCase()] || {};
};

const mapGreenRvScheduleItem = (item, specPlan = {}) => {
  const matchedSpecPlan = getSpecPlanForChassis(specPlan, item.Chassis);

  return {
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
    "production status": formatProductionStatus(item["Vin Number"]),
    spec: matchedSpecPlan.spec || null,
    plan: matchedSpecPlan.plan || null
  };
};

const mapGreenRvCampervanScheduleItem = (item, specPlan = {}) => {
  const matchedSpecPlan = getSpecPlanForChassis(specPlan, item.chassisNumber);

  return {
    Chassis: item.chassisNumber || null,
    Customer: item.customer || null,
    Dealer: item.dealer || null,
    "Forecast Production Date": item.forecastProductionDate || null,
    "Regent Production": item.regentProduction || item["Regent Production"] || null,
    "Signed Plans Received": item.signedOrderReceived || item.signedPlansReceived || item["Signed Plans Received"] || null,
    spec: matchedSpecPlan.spec || null,
    plan: matchedSpecPlan.plan || null
  };
};

const registerGreenRvSchedulingApi = (app, { fetch, baseUrl }) => {
  app.get("/greenrv/schedulingapi", async (req, res) => {
    if (!authorizeGreenRvRequest(req, res)) {
      return;
    }

    try {
      const [scheduleResponse, campervanScheduleResponse, specPlanResponse] = await Promise.all([
        fetch(`${baseUrl}/schedule.json`),
        fetch(`${baseUrl}/campervanSchedule.json`),
        fetch(`${baseUrl}/spec_plan.json`)
      ]);

      if (!scheduleResponse.ok) {
        return res.status(scheduleResponse.status).json({
          error: "Upstream Error",
          message: "Failed to fetch schedule",
          status: scheduleResponse.status
        });
      }

      if (!campervanScheduleResponse.ok) {
        return res.status(campervanScheduleResponse.status).json({
          error: "Upstream Error",
          message: "Failed to fetch campervanSchedule",
          status: campervanScheduleResponse.status
        });
      }

      if (!specPlanResponse.ok) {
        return res.status(specPlanResponse.status).json({
          error: "Upstream Error",
          message: "Failed to fetch spec_plan",
          status: specPlanResponse.status
        });
      }

      const schedule = await scheduleResponse.json();
      const campervanSchedule = await campervanScheduleResponse.json();
      const specPlan = await specPlanResponse.json();
      const scheduleOrders = Object.values(schedule || {})
        .filter(Boolean)
        .filter((item) => String(item.Customer || "").trim())
        .filter((item) => GREENRV_DEALERS.has(String(item.Dealer || "").trim().toLowerCase()))
        .map((item) => mapGreenRvScheduleItem(item, specPlan || {}));
      const campervanScheduleOrders = Object.values(campervanSchedule || {})
        .filter(Boolean)
        .filter((item) => String(item.customer || "").trim())
        .filter((item) => GREENRV_DEALERS.has(String(item.dealer || "").trim().toLowerCase()))
        .map((item) => mapGreenRvCampervanScheduleItem(item, specPlan || {}));
      const orders = [...scheduleOrders, ...campervanScheduleOrders];

      return sendEncryptedGreenRvResponse(res, {
        orders,
        orderCount: orders.length,
        dealers: Array.from(GREENRV_DEALERS)
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = {
  registerGreenRvSchedulingApi
};

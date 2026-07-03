# API Documentation

## Base URL
- Production: `https://firebase-api-2mx9.onrender.com/api`
- Local: `http://localhost:3000`

> If you use the production base URL above, endpoint paths are appended after `/api`.
> Example: `https://firebase-api-2mx9.onrender.com/api/mes-schedule`

---

## 1) GET `/api/mes-schedule`
Returns three datasets:
- `schedule`: data from the `schedule` node, filtered by business rules and mapped to a reduced schema.
- `campervanSchedule`: data from the `campervanSchedule` node, mapped to a reduced schema.
- `requisitionTickets`: data from `mes/requisitionTickets`, filtered to keep only records where:
  - `changeMode === "expedite"`, or
  - `type === "after-signed-off-change"`
  and mapped to a reduced schema.

### `schedule` filter rules
Only records that meet all conditions below are returned:
1. `Signed Plans Received` exists and is not `No` (case-insensitive)
2. `Regent Production` is not `finished` (case-insensitive)

### `schedule` output fields
- `Chassis`
- `Dealer`
- `Customer`
- `Model`
- `ModelYear`
- `ForecastProductionDate`
- `SignedPlansReceived`
- `aging` (integer days: today - SignedPlansReceived)
- `140daysplan` (boolean)
- `dealerStockLevel` (`"less" | "over" | "normal"`)
- `customerType` (`"stock" | "prototype" | "customer"`)

### `campervanSchedule` output fields
- `Chassis`
- `Dealer`
- `Customer`
- `Model`
- `ModelYear`
- `ForecastProductionDate`
- `VinNumber`
- `customerType` (`"stock" | "prototype" | "customer"`)

### `dealerStockLevel` mapping logic
Source node: `scheduleDealerStockLevels`

Example source format:
```json
{
  "Forest Glen": "over",
  "Frankston": "less",
  "Some Dealer": "normal"
}
```

Rules:
1. Match by dealer name (case-insensitive, trim spaces).
2. If source value is exactly `less` or `over` (case-insensitive), output that value.
3. If source value is `normal`, any other unexpected value, or dealer not found, output `normal`.

### `customerType` mapping logic
1. If `Customer` contains `prototype` (case-insensitive), output `prototype`.
2. Else if `Customer` ends with `stock` (case-insensitive), output `stock`.
3. Otherwise output `customer`.

### `140daysplan` logic
`140daysplan` is `true` only when both conditions are met:
1. `Signed Plans Received` can be parsed as `dd/mm/yyyy` and is **after** `23/03/2026`
2. `Customer` does not end with `stock` (case-insensitive)

### `aging` logic
`aging` equals **today (UTC date)** minus `Signed Plans Received` in days.
- If `Signed Plans Received` is invalid or missing, `aging` is `null`.

### Success response example
```json
{
  "schedule": [
    {
      "Chassis": "CH-001",
      "Dealer": "Dealer A",
      "Customer": "ACME",
      "Model": "X1",
      "ModelYear": "2026",
      "ForecastProductionDate": "30/03/2026",
      "SignedPlansReceived": "24/03/2026",
      "aging": 34,
      "140daysplan": true,
      "dealerStockLevel": "over",
      "customerType": "customer"
    }
  ],
  "campervanSchedule": [
    {
      "Chassis": "CV-001",
      "Dealer": "Frankston",
      "Customer": "ABC Pty Ltd",
      "Model": "Camper 2",
      "ModelYear": "2026",
      "ForecastProductionDate": "01/04/2026",
      "VinNumber": "VIN123",
      "customerType": "stock"
    }
  ],
  "requisitionTickets": [
    {
      "id": "-Nx123",
      "chassis": "CH-001",
      "partNumber": "P-001",
      "changeMode": "expedite",
      "type": null,
      "status": "open"
    }
  ]
}
```

---

## 2) GET `/api/mes-schedule/:chassis`
Returns all data in this API related to one chassis (exact match, case-insensitive), using the same filtering/mapping rules as `/api/mes-schedule`.

- `schedule`: matching records where `Chassis === :chassis`, then reduced to API output fields
- `campervanSchedule`: matching records where `chassisNumber === :chassis`, then reduced to API output fields
- `requisitionTickets`: matching records where `chassis === :chassis` and ticket filter matches (`expedite` or `after-signed-off-change`), then reduced to API output fields

### Success response example
```json
{
  "chassis": "SRT255572",
  "schedule": [
    {
      "Chassis": "SRT255572",
      "Dealer": "Dealer A",
      "ForecastProductionDate": "30/03/2026",
      "SignedPlansReceived": "24/03/2026",
      "aging": 34,
      "dealerStockLevel": "normal",
      "customerType": "prototype"
    }
  ],
  "requisitionTickets": [
    {
      "id": "-Nx123",
      "chassis": "SRT255572",
      "partNumber": "P-001",
      "changeMode": "expedite",
      "type": null,
      "status": "open"
    }
  ]
}
```

### Error responses
- `404`: no schedule or ticket data found for the chassis
- `5xx`: upstream or server error

---

## 3) GET `/schedule/:id`
Reads one record from `schedule/{id}`.

- If `:id` is a Firebase key: read `/schedule/{id}.json` directly.
- If key lookup returns empty and `:id` is a non-negative integer: resolve by index from `/schedule.json`.

### Success response example
```json
{
  "id": "-NxAbc",
  "Chassis": "CH-001",
  "Dealer": "Dealer A"
}
```

### Error responses
- `404`: record not found
- `5xx`: upstream or server error

---

## 4) GET `/mes/requisitionTickets/:id`
Reads one record from `mes/requisitionTickets/{id}`.

### Success response example
```json
{
  "id": "-Nx123",
  "chassis": "CH-001",
  "partNumber": "P-001",
  "status": "open"
}
```

### Error responses
- `404`: record not found
- `5xx`: upstream or server error

---


---

## 5) GET `/greenrv/schedulingapi`
Returns schedule orders for Green RV dealers only.

### Dealer filter
Only records from the `schedule` node where `Dealer` matches one of these values are returned (case-insensitive, trim spaces):
- `Green Show`
- `Slacks Creek`
- `Forest Glen`

### Output fields
Each order includes these fields from the source schedule record:
- `Chassis`
- `Customer`
- `Dealer`
- `Forecast Production Date`
- `Model`
- `Model Year`
- `Order Received Date`
- `Regent Production`
- `Shipment`
- `Signed Plans Received`
- `production status` (read from source field `Vin Number`)

### Optional encrypted response
Add `?encrypt=true` or request header `x-encrypt-response: true` to return an encrypted payload.

Encrypted responses use AES-256-GCM. Set `GREENRV_API_ENCRYPTION_KEY` in the server environment before requesting encryption. The key is hashed with SHA-256 to produce the AES key.

Encrypted response shape:
```json
{
  "encrypted": true,
  "algorithm": "aes-256-gcm",
  "iv": "base64-iv",
  "authTag": "base64-auth-tag",
  "data": "base64-ciphertext"
}
```

### Success response example
```json
{
  "orders": [
    {
      "Chassis": "CH-001",
      "Customer": "ACME",
      "Dealer": "Forest Glen",
      "Forecast Production Date": "30/03/2026",
      "Model": "X1",
      "Model Year": "2026",
      "Order Received Date": "01/02/2026",
      "Regent Production": "In Production",
      "Shipment": "Pending",
      "Signed Plans Received": "24/03/2026",
      "production status": "VIN123"
    }
  ],
  "orderCount": 1,
  "dealers": ["green show", "slacks creek", "forest glen"]
}
```

## 6) Other paths
Unmatched routes return `404` with available endpoint hints:
- `/api/mes-schedule`
- `/api/mes-schedule/:chassis`
- `/greenrv/schedulingapi`
- `/schedule/:id`
- `/mes/requisitionTickets/:id`

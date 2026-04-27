# API Documentation

## Base URL
- Production: `https://firebase-api-2mx9.onrender.com/api`
- Local: `http://localhost:3000`

> If you use the production base URL above, endpoint paths are appended after `/api`.
> Example: `https://firebase-api-2mx9.onrender.com/api/mes-schedule`

---

## 1) GET `/api/mes-schedule`
Returns two datasets:
- `schedule`: data from the `schedule` node, filtered by business rules and mapped to a reduced schema.
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
      "140daysplan": true
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
      "aging": 34
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

## 5) Other paths
Unmatched routes return `404` with available endpoint hints:
- `/api/mes-schedule`
- `/api/mes-schedule/:chassis`
- `/schedule/:id`
- `/mes/requisitionTickets/:id`

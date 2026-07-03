# Green RV Scheduling API - User Guide

## API address

Production endpoint:

```text
https://firebase-api-2mx9.onrender.com/greenrv/schedulingapi
```

Method:

```text
GET
```

## What this API includes

The API reads from the Firebase `schedule` node and only includes orders that match both conditions:

1. `Customer` is not empty.
2. `Dealer` is one of:
   - `Green Show`
   - `Slacks Creek`
   - `Forest Glen`

After decrypting the response, each order includes these fields:

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
- `production status`

If `production status` is only numbers, it is returned as `Longtree Production: <number>`.

## Security model

This API has two secrets:

1. `GREENRV_SCHEDULING_API_KEY`
   - Used by the client when calling the API.
   - Send it in the request header as `x-api-key` or as an `Authorization: Bearer` token.
   - This stops random users from opening the URL and reading data.

2. `GREENRV_API_ENCRYPTION_KEY`
   - Used to encrypt the successful API response on the server.
   - Used by the client to decrypt the response body.
   - Successful responses are always encrypted, so the API does not return plaintext order data.

These values are not automatically provided by Render. You create them yourself, save them in Render as environment variables, and share them only with the approved Green RV consumer.

## How to create the secrets

Use two different long random strings. For example, run this locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run it twice:

- Use the first value as `GREENRV_SCHEDULING_API_KEY`.
- Use the second value as `GREENRV_API_ENCRYPTION_KEY`.

Do not commit these values to GitHub and do not put them in `API.md`.

## How to set the secrets in Render

> Important: do not commit the real secret values to this repository. Put the real values only in Render Environment Variables. The examples below intentionally use placeholders.

1. Open the Render dashboard.
2. Open the service for this API.
3. Go to **Environment**.
4. Add this environment variable:

```text
GREENRV_SCHEDULING_API_KEY=<paste the real API key in Render only>
```

5. Add this environment variable:

```text
GREENRV_API_ENCRYPTION_KEY=<paste the real encryption key in Render only>
```

6. Save the changes.
7. Redeploy or restart the service so the new environment variables are loaded.

If these environment variables are missing, `/greenrv/schedulingapi` returns `503 Service Unavailable` and does not return order data.

## How a user calls the API

Using `x-api-key`:

```bash
curl -H "x-api-key: <GREENRV_SCHEDULING_API_KEY>" \
  https://firebase-api-2mx9.onrender.com/greenrv/schedulingapi
```

Using `Authorization: Bearer`:

```bash
curl -H "Authorization: Bearer <GREENRV_SCHEDULING_API_KEY>" \
  https://firebase-api-2mx9.onrender.com/greenrv/schedulingapi
```

If the key is missing or incorrect, the API returns `401 Unauthorized`.

## What the API returns before decryption

Successful responses look like this:

```json
{
  "encrypted": true,
  "algorithm": "aes-256-gcm",
  "iv": "base64-iv",
  "authTag": "base64-auth-tag",
  "data": "base64-ciphertext"
}
```

`data` is encrypted. The user must decrypt it with `GREENRV_API_ENCRYPTION_KEY`.

## Node.js decrypt example

```js
const crypto = require("crypto");

const decryptGreenRvPayload = (payload, encryptionSecret) => {
  const key = crypto.createHash("sha256").update(encryptionSecret).digest();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString("utf8"));
};
```

Example usage:

```js
const encryptedResponse = await fetch(
  "https://firebase-api-2mx9.onrender.com/greenrv/schedulingapi",
  {
    headers: {
      "x-api-key": process.env.GREENRV_SCHEDULING_API_KEY
    }
  }
).then((response) => response.json());

const decryptedPayload = decryptGreenRvPayload(
  encryptedResponse,
  process.env.GREENRV_API_ENCRYPTION_KEY
);

console.log(decryptedPayload.orders);
```

## Decrypted response example

After decryption, the payload looks like this:

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
      "production status": "Longtree Production: 12345"
    }
  ],
  "orderCount": 1,
  "dealers": ["green show", "slacks creek", "forest glen"]
}
```

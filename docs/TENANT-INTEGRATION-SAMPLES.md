# Tenant Integration Samples

## 1) Trigger conversion

```bash
curl -X POST https://letmein.cambodia.com/api/conversions/trigger \
  -H 'Content-Type: application/json' \
  -H 'x-letmein-api-key: YOUR_TENANT_INTEGRATION_API_KEY' \
  -d '{
    "tenant_id":"11111111-1111-1111-1111-111111111111",
    "referral_id":"22222222-2222-2222-2222-222222222222",
    "event_type":"first_purchase"
  }'
```

## 2) Verify and redeem discount code

```bash
curl -X POST https://letmein.cambodia.com/api/discounts/verify \
  -H 'Content-Type: application/json' \
  -H 'x-letmein-api-key: YOUR_TENANT_INTEGRATION_API_KEY' \
  -d '{
    "tenant_id":"11111111-1111-1111-1111-111111111111",
    "code":"WELCOME1A2B"
  }'
```

## 3) Submit manual payout request

```bash
curl -X POST https://letmein.cambodia.com/api/commissions/payout \
  -H 'Content-Type: application/json' \
  -H 'x-letmein-api-key: YOUR_TENANT_INTEGRATION_API_KEY' \
  -d '{
    "referral_id":"22222222-2222-2222-2222-222222222222",
    "khqr_number":"0123456789"
  }'
```

## 4) Get tenant rules

```bash
curl https://letmein.cambodia.com/api/tenants/11111111-1111-1111-1111-111111111111/rules
```

## Telegram webhook sample update payload (from Telegram)

```json
{
  "update_id": 999999999,
  "message": {
    "message_id": 105,
    "from": {
      "id": 123456789,
      "is_bot": false,
      "first_name": "Sok",
      "username": "sok_customer",
      "language_code": "en"
    },
    "chat": {
      "id": 123456789,
      "first_name": "Sok",
      "username": "sok_customer",
      "type": "private"
    },
    "date": 1760000000,
    "text": "/payout"
  }
}
```

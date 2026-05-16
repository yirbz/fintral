# Frontend Parity Checklist

This checklist maps legacy `backend/templates` interactions to new `frontend/` behavior.

## Global Shell

- Sidebar navigation -> `/app`, `/app/invoices`, `/app/upload`, `/app/reports`, `/app/settings`
- Global search -> redirects to `/app/invoices?search=<term>`
- Notification dropdown -> `GET /api/notifications`, `POST /api/notifications/read-all`
- Finance chat -> `POST /api/chat/finance`
- Realtime status and events -> `GET /ws` WebSocket channel

## Dashboard

- KPI cards and statistics -> `GET /statistics?period=30d`
- Recent activity feed -> `GET /invoices`
- Live pulse log -> WebSocket event stream

## Invoices Table

- List/filter invoices -> `GET /invoices`
- Open invoice detail -> `/app/invoices/[invoiceId]`
- Process one -> `POST /process/{invoice_id}`
- Process all pending -> iterative `POST /process/{invoice_id}`
- Bulk process -> `POST /api/invoices/bulk-process`
- Bulk delete -> `POST /api/invoices/bulk-delete`
- Push webhook -> `POST /api/invoices/push-webhook`
- Export selected -> `GET /export/csv?format=...&invoice_ids=...`

## Upload Pipeline

- Upload files -> `POST /upload` with `files`, `category`, `transaction_type`
- Process uploaded invoice -> `POST /process/{invoice_id}`
- Edit row and save -> `PUT /invoices/{invoice_id}`
- Approve all -> navigates to `/app/invoices`

## Invoice Detail

- Load invoice -> `GET /invoices/{invoice_id}`
- Process invoice -> `POST /process/{invoice_id}`
- Save edits -> `PUT /invoices/{invoice_id}`
- Delete invoice -> `DELETE /invoices/{invoice_id}`
- Download source -> `/uploads/{filename}`
- Optimized image preview -> `GET /invoice/{invoice_id}/optimized-image`

## Reports

- Period tabs -> `GET /statistics?period=7d|30d|90d`
- Cost/volume chart -> `statistics.charts.volume_history`
- Alert distribution -> `statistics.audit.distribution`
- Trend chart -> `statistics.monthly_stats`

## Settings

- Load/save settings -> `GET /api/settings`, `POST /api/settings`
- WhatsApp status -> `GET /evolution/proxy/status`
- WhatsApp QR -> `GET /evolution/proxy/qr`
- WhatsApp instance create -> `POST /evolution/proxy/create`
- Webhooks list/create/delete/test -> `GET/POST/DELETE /api/webhooks`, `POST /api/webhooks/{id}/test`

## Public and Legacy Routes

- Landing -> `/`
- Login -> `/login` -> `POST /token` (now sets HttpOnly cookie)
- Legacy `/settings` -> `/app/settings` redirect
- Legacy `/reports` -> `/app/reports` redirect
- Legacy `/invoice/{id}/view` -> `/app/invoices/{id}` redirect

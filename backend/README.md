# FreelanceFlow Backend

## Stack
- Node.js
- Express.js
- PostgreSQL (via Sequelize or Knex)
- JWT Auth
- PDFKit for invoice generation

## Setup
1. `npm install`
2. Configure `.env` for DB and JWT secrets
3. `npm run dev` to start the server

## API Structure
- `/api/auth` — Authentication
- `/api/clients` — Client CRUD
- `/api/projects` — Project CRUD
- `/api/tasks` — Task CRUD
- `/api/timelogs` — Time tracking
- `/api/invoices` — Invoice generation
- `/api/sample-data` — Load demo data

## Notes
- All endpoints require authentication.
- All data is scoped to the authenticated user (multi-tenancy).

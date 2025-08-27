# Octo Bill

Usage-based SaaS billing platform backend built with Node.js, Express, MongoDB, and Authorize.net.

## Features

- User registration & authentication (JWT)
- Usage tracking (start/end activities)
- Payment method management (card/bank via Authorize.net)
- Manual billing for usage
- Analytics endpoints for admin and users
- Role-based access control (admin/user)
- RESTful API structure

## Project Structure

```
.
├── app.js
├── config/
│   ├── authorize.js
│   └── db.js
├── controllers/
├── middlewares/
├── models/
├── public/
├── ref/
├── routes/
├── services/
├── utils/
├── .env
├── .gitignore
├── octo_bill customer.postman_collection.json
├── package.json
└── vercel.json
```

## Setup

1. **Clone the repo**
   ```sh
   git clone https://github.com/capture-grey/backend-nb.git
   cd backend-nb
   ```

2. **Install dependencies**

   npm install


3. **Configure environment variables**

   Create a `.env` file:
   ```
   PORT=5000
   MONGO_CONNECTION_STRING=your_mongodb_uri
   JWT_SECRET=your_jwt_secret
   JWT_EXPIRES_IN=expiry_duration
   #cookie secret not required
   COOKIE_SECRET=your_cookie_secret
   # Authorize.net credentials
   API_LOGIN_ID=your_api_login_id
   TRANSACTION_KEY=your_transaction_key
   AUTHORIZE_NET_ENV=sandbox
   ```

5. **Start the server**
   npm start


## API Endpoints
please import "octo_bill customer.postman_collection.json" in postman for 
example request body + response and brief detail in documentation

### Auth

- `POST /api/auth/register` — Register new user
- `POST /api/auth/login` — Login

### Usage

- `POST /api/usage/start/:userId` — Start usage activity
- `POST /api/usage/end/:userId` — End usage activity

### Payment

- `POST /api/payment/:userId` — Add payment method (card/bank)

### Billing

- `POST /api/billing/manual` — Charge all users (admin)
- `POST /api/billing/manual/users` — Charge selected users (admin)

### Analytics

- `GET /api/analytics/admin/general` — Admin general stats
- `GET /api/analytics/admin/top-user` — Top paying user
- `GET /api/analytics/admin/timezone-usage` — Usage by timezone
- `GET /api/analytics/user/:userId/general` — User general stats
- `GET /api/analytics/user/:userId/usage` — User usage breakdown
- `GET /api/analytics/user/:userId/activity` — Usage by activity type

## Development

- Uses [nodemon](https://nodemon.io/) for auto-reload (`npm start`)
- Error handling and 404 middleware included
- Vercel deployment supported via `vercel.json`

## License

ISC

---

For more

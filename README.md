# MediQueue - Tutor Booking System (Backend API)

Greeting to the **Programming Hero** Team! This repository houses the robust, secure, and highly optimized RESTful API backend engineered for **MediQueue** (Assignment 9). It provides a production-grade architecture handling database transactions, complex data aggregations, role-based security layers, and seamless cross-origin connectivity.

---

## 🛠️ Core Technologies & Libraries Used
- **Runtime Environment:** Node.js
- **Backend Framework:** Express.js
- **Database Cloud Engine:** MongoDB Atlas
- **Data Modeling & ODM:** Mongoose
- **Security & Cryptography:** JWT (jsonwebtoken), Bcrypt.js
- **Middleware Infrastructure:** CORS, Express JSON Parser, Options Preflight Resolver

---

## 🌟 Key Backend Architecture & Features

### 1. Absolute Cross-Origin Security (CORS)
- Hardened CORS configuration explicitly whitelisting the live production client (`https://ph-b13-a9-sii-medi-queue.vercel.app`) alongside local development lines (`http://localhost:5173`).
- Handles preflight `OPTIONS` requests perfectly to prevent Vercel cross-origin blocking errors.

### 2. Cryptographic Session & Role-Based Access Control (RBAC)
- **Token Security:** Standard JWT authorization flows verifying requests via `Bearer <JWT_TOKEN>` headers.
- **Access Guard Middleware:** Custom middleware checking system claims to restrict sensitive endpoints based on roles (`student` vs `tutor` vs `admin`), preventing unauthorized route elevation.

### 3. Automated Transactional Ledger System (The Core Hook)
- Whenever a student schedules a tutoring session (`POST /api/bookings`), a database hook automatically triggers, compiling an immutable cash **inflow** ledger transaction in the financial collection.
- Supports timeline query parsing (`?timeline=daily|weekly|monthly`) to dynamic-sum flows for real-time client analytics charts.

### 4. Admin Profile Verification & Approval Queues
- Specialized database schemas map pending profile identity change requests and tutor profile applications.
- Supports partial/subset administrative acceptance (`PATCH /api/approvals/:id`), overwriting target data fields instantly upon approval logs.

---

## 📦 Local Installation & Environment Setup

1. **Clone the Repository:**
   

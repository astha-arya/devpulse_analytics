# ⚡️ DevPulse: Link Intelligence Platform

DevPulse is a high-performance URL shortener and telemetry analytics platform built with the MERN stack. It goes beyond basic redirection by offering enterprise-grade features including Redis-backed rate limiting, granular UTM campaign tracking, privacy-first cookie-less unique visitor fingerprinting, and dynamic geographic heatmaps.

## ✨ Key Features

* **Advanced Link Management:** Create custom aliases with configurable expiration dates, maximum click thresholds, and bcrypt-secured password gates.
* **Granular Telemetry & UTM Parsing:** Automatically parses and logs UTM parameters (source, medium, campaign, term, content) alongside device, browser, and referrer data across 10+ data dimensions per click.
* **Privacy-First Unique Visitor Tracking:** Implements cookie-less unique visitor tracking by generating SHA-256 cryptographic fingerprints from incoming IP addresses and User-Agent strings.
* **Geospatial Traffic Heatmaps:** Translates IPv4/IPv6 addresses to geographic locations (using `geoip-lite`) and visualizes global traffic density via interactive, zoomable SVG world maps.
* **Bot Defense & Rate Limiting:** Utilizes a Redis-backed sliding-window algorithm (`zadd`, `zremrangebyscore`) to prevent bot-driven DDoS attacks, featuring a "fail-open" architecture to maintain 100% uptime even if the caching layer drops.

## 🛠️ Tech Stack

**Frontend:**
* React 18 (Vite)
* TypeScript
* Tailwind CSS v4
* Recharts (Data Visualization)
* React Simple Maps (Geospatial Visualization)
* Lucide React (Icons)

**Backend:**
* Node.js & Express.js
* MongoDB & Mongoose (Data Persistence)
* Redis / `ioredis` (Rate Limiting & Caching)
* `geoip-lite` (IP Geolocation)
* `bcryptjs` & `crypto` (Hashing & Fingerprinting)

## 🚀 Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) (v18+)
* [MongoDB](https://www.mongodb.com/) (Local or Atlas)
* [Redis](https://redis.io/) (Running on default port `6379`)

### Installation

**1. Clone the repository:**
```bash
git clone [https://github.com/your-username/devpulse.git](https://github.com/your-username/devpulse.git)
cd devpulse
```

**2. Setup the Backend:**
```bash
cd backend
npm install
```

**3. Setup the Frontend:**
```bash
cd ../frontend
npm install
```

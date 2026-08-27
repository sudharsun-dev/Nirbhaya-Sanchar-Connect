# DEPLOYMENT GUIDE — NIRBHAYA SANCHAR ENGINE (SYSTEM 2)

## Local Development Execution

### 1. Backend Server Execution
```bash
cd Engine
$env:PYTHONPATH="backend"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend Execution
```bash
cd Engine/frontend
npm run dev
```
Open `http://localhost:5174` in browser.

---

## Docker Container Deployment

```bash
cd Engine
docker-compose up --build -d
```
Backend API will be accessible at `http://localhost:8000`.

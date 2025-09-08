# Dragon Isle Port Assignments

This document tracks the port assignments for the Dragon Isle project, managed by portman.py.

## Assigned Ports

| Port | Purpose | Environment | Status |
|------|---------|-------------|---------|
| 3003 | Development Server | Development | ✅ Reserved |
| 8081 | Production Container | Production | ✅ Reserved |
| 9001 | Future Services | Development/Testing | ✅ Reserved |

## Port Usage

### Development (Port 3003)
- Used by Vite development server
- Serves the React + Phaser 3 application
- Hot reload and development features enabled
- Access: `http://localhost:3003`

### Production (Port 8081)
- Docker container with nginx serving built application
- Optimized static assets with compression
- PWA service worker enabled
- Access: `http://localhost:8081`

### Future Services (Port 9001)
- Reserved for potential future services:
  - WebSocket connections for multiplayer features
  - Development proxy or testing services
  - Monitoring or analytics endpoints

## Port Management

Ports are managed using the system portman.py tool:

```bash
# View current reservations
python3 /root/project/portman.py show

# Check port availability
python3 /root/project/portman.py list

# Reserve additional ports if needed
python3 /root/project/portman.py reserve dragon-isle <port>

# Free ports if no longer needed
python3 /root/project/portman.py free <port>
```

## Deployment Commands

### Development
```bash
cd dragon-isle
pnpm dev
# Starts on port 3003
```

### Production
```bash
cd dragon-isle
./infra/deploy.sh
# Deploys container on port 8081
```

### Custom Port
```bash
./infra/deploy.sh latest 9001
# Deploy on port 9001 instead
```

## Network Configuration

- **Development**: Binds to `localhost:3003` with host access
- **Production**: Binds to `0.0.0.0:8081` for external access
- **Security**: Production uses nginx with proper headers and caching
- **HTTPS**: Can be configured with reverse proxy (nginx/Apache)

## Port Conflicts

If ports are occupied:

1. Check active usage: `python3 /root/project/portman.py list`
2. Find alternative: `python3 /root/project/portman.py find`
3. Free if needed: `python3 /root/project/portman.py free <port>`
4. Update configuration files accordingly

## Reserved Date
- **Reserved**: 2025-09-07
- **Project**: dragon-isle
- **Total Ports**: 3 (3003, 8081, 9001)
#!/bin/bash

# 🚀 Complete Deployment Script
# Bu script barcha 4 ta servisni Docker Hub'ga build va push qiladi

set -e  # Xato bo'lsa to'xtatish

echo "🚀 Starting deployment process..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOCKER_USERNAME="findbeauty"
VPS_IP="${VPS_IP:-YOUR_VPS_IP}"  # Environment variable yoki default qiymat

# VPS IP'ni so'rash (agar o'rnatilmagan bo'lsa)
if [ "$VPS_IP" = "YOUR_VPS_IP" ]; then
    echo -e "${YELLOW}⚠️  VPS IP'ni kiriting:${NC}"
    read -p "VPS IP: " VPS_IP
    export VPS_IP
fi

# Backend URL'lar
BACKEND_URL="http://${VPS_IP}:3000"
SUPPLIER_BACKEND_URL="http://${VPS_IP}:3002"

echo -e "${BLUE}📋 Configuration:${NC}"
echo "  VPS IP: $VPS_IP"
echo "  Backend URL: $BACKEND_URL"
echo "  Supplier Backend URL: $SUPPLIER_BACKEND_URL"
echo ""

# Docker Hub'ga login tekshirish
echo -e "${BLUE}🔐 Docker Hub login tekshirish...${NC}"
if ! docker info | grep -q "Username"; then
    echo -e "${YELLOW}⚠️  Docker Hub'ga login qilish kerak${NC}"
    docker login
fi

# Buildx'ni tayyorlash
echo -e "${BLUE}🏗️  Docker Buildx tayyorlash...${NC}"
docker buildx create --use --name multiarch-builder 2>/dev/null || docker buildx use multiarch-builder
docker buildx inspect --bootstrap

# 1. Clinic Backend
echo -e "${GREEN}📦 Building Clinic Backend...${NC}"
docker buildx build \
  --platform linux/amd64 \
  -f apps/backend/Dockerfile \
  -t ${DOCKER_USERNAME}/clinic-backend:latest \
  --push .

echo -e "${GREEN}✅ Clinic Backend build va push qilindi${NC}"
echo ""

# 2. Clinic Frontend
echo -e "${GREEN}📦 Building Clinic Frontend...${NC}"
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=${BACKEND_URL} \
  -f apps/frontend/Dockerfile \
  -t ${DOCKER_USERNAME}/clinic-frontend:latest \
  --push .

echo -e "${GREEN}✅ Clinic Frontend build va push qilindi${NC}"
echo ""

# 3. Supplier Backend
echo -e "${GREEN}📦 Building Supplier Backend...${NC}"
docker buildx build \
  --platform linux/amd64 \
  -f apps/supplier-backend/Dockerfile \
  -t ${DOCKER_USERNAME}/supplier-backend:latest \
  --push .

echo -e "${GREEN}✅ Supplier Backend build va push qilindi${NC}"
echo ""

# 4. Supplier Frontend
echo -e "${GREEN}📦 Building Supplier Frontend...${NC}"
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=${SUPPLIER_BACKEND_URL} \
  -f apps/supplier-frontend/Dockerfile \
  -t ${DOCKER_USERNAME}/supplier-frontend:latest \
  --push .

echo -e "${GREEN}✅ Supplier Frontend build va push qilindi${NC}"
echo ""

# Summary
echo -e "${GREEN}🎉 Barcha image'lar muvaffaqiyatli build va push qilindi!${NC}"
echo ""
echo -e "${BLUE}📋 Keyingi qadamlar:${NC}"
echo "  1. VPS'ga SSH orqali kirish: ssh user@${VPS_IP}"
echo "  2. Image'larni pull qilish: docker pull ${DOCKER_USERNAME}/clinic-backend:latest"
echo "  3. Container'larni ishga tushirish: docker-compose -f docker-compose.prod.yml up -d"
echo ""
echo -e "${YELLOW}📖 To'liq qo'llanma: COMPLETE_DEPLOYMENT_GUIDE_V2.md${NC}"


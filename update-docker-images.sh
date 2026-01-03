#!/bin/bash

# 🚀 Docker Image'larni Yangilash Script
# Bu script o'zgarishlarni Docker Hub'ga push qiladi

set -e  # Xato bo'lsa to'xtatish

echo "🚀 Starting Docker images update process..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOCKER_USERNAME="findbeauty"
VPS_IP="${VPS_IP:-54.237.247.19}"  # ✅ O'z EC2 IP'ingizga o'zgartiring

# Backend URL'lar
BACKEND_URL="http://${VPS_IP}:3000"
SUPPLIER_BACKEND_URL="http://${VPS_IP}:3002"

echo -e "${BLUE}📋 Configuration:${NC}"
echo "  VPS IP: $VPS_IP"
echo "  Backend URL: $BACKEND_URL"
echo "  Supplier Backend URL: $SUPPLIER_BACKEND_URL"
echo ""

# Project root directory'ga o'tish
cd "$(dirname "$0")"
echo -e "${BLUE}📁 Project directory: $(pwd)${NC}"
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
docker buildx inspect --bootstrap > /dev/null 2>&1 || true

# Qaysi servislarni rebuild qilishni so'rash
echo -e "${YELLOW}❓ Qaysi servislarni rebuild qilmoqchisiz?${NC}"
echo "  1) Barcha servislar (Backend, Frontend, Supplier-Backend, Supplier-Frontend)"
echo "  2) Faqat Backend'lar (Clinic + Supplier)"
echo "  3) Faqat Frontend'lar (Clinic + Supplier)"
echo "  4) Faqat Clinic servislar (Backend + Frontend)"
echo "  5) Faqat Supplier servislar (Backend + Frontend)"
echo "  6) Faqat Clinic Backend"
echo "  7) Faqat Clinic Frontend"
echo "  8) Faqat Supplier Backend"
echo "  9) Faqat Supplier Frontend"
read -p "Tanlang (1-9): " choice

case $choice in
    1)
        SERVICES="all"
        ;;
    2)
        SERVICES="backends"
        ;;
    3)
        SERVICES="frontends"
        ;;
    4)
        SERVICES="clinic"
        ;;
    5)
        SERVICES="supplier"
        ;;
    6)
        SERVICES="clinic-backend"
        ;;
    7)
        SERVICES="clinic-frontend"
        ;;
    8)
        SERVICES="supplier-backend"
        ;;
    9)
        SERVICES="supplier-frontend"
        ;;
    *)
        echo -e "${YELLOW}⚠️  Noto'g'ri tanlov. Barcha servislar rebuild qilinadi.${NC}"
        SERVICES="all"
        ;;
esac

# Build functions
build_clinic_backend() {
    echo -e "${GREEN}📦 Building Clinic Backend...${NC}"
    docker buildx build \
      --platform linux/amd64 \
      -f apps/backend/Dockerfile \
      -t ${DOCKER_USERNAME}/clinic-backend:latest \
      --push .
    echo -e "${GREEN}✅ Clinic Backend build va push qilindi${NC}"
    echo ""
}

build_clinic_frontend() {
    echo -e "${GREEN}📦 Building Clinic Frontend...${NC}"
    docker buildx build \
      --platform linux/amd64 \
      --build-arg NEXT_PUBLIC_API_URL=${BACKEND_URL} \
      -f apps/frontend/Dockerfile \
      -t ${DOCKER_USERNAME}/clinic-frontend:latest \
      --push .
    echo -e "${GREEN}✅ Clinic Frontend build va push qilindi${NC}"
    echo ""
}

build_supplier_backend() {
    echo -e "${GREEN}📦 Building Supplier Backend...${NC}"
    docker buildx build \
      --platform linux/amd64 \
      -f apps/supplier-backend/Dockerfile \
      -t ${DOCKER_USERNAME}/supplier-backend:latest \
      --push .
    echo -e "${GREEN}✅ Supplier Backend build va push qilindi${NC}"
    echo ""
}

build_supplier_frontend() {
    echo -e "${GREEN}📦 Building Supplier Frontend...${NC}"
    docker buildx build \
      --platform linux/amd64 \
      --build-arg NEXT_PUBLIC_API_URL=${SUPPLIER_BACKEND_URL} \
      -f apps/supplier-frontend/Dockerfile \
      -t ${DOCKER_USERNAME}/supplier-frontend:latest \
      --push .
    echo -e "${GREEN}✅ Supplier Frontend build va push qilindi${NC}"
    echo ""
}

# Build based on choice
case $SERVICES in
    "all")
        build_clinic_backend
        build_clinic_frontend
        build_supplier_backend
        build_supplier_frontend
        ;;
    "backends")
        build_clinic_backend
        build_supplier_backend
        ;;
    "frontends")
        build_clinic_frontend
        build_supplier_frontend
        ;;
    "clinic")
        build_clinic_backend
        build_clinic_frontend
        ;;
    "supplier")
        build_supplier_backend
        build_supplier_frontend
        ;;
    "clinic-backend")
        build_clinic_backend
        ;;
    "clinic-frontend")
        build_clinic_frontend
        ;;
    "supplier-backend")
        build_supplier_backend
        ;;
    "supplier-frontend")
        build_supplier_frontend
        ;;
esac

# Summary
echo -e "${GREEN}🎉 Barcha tanlangan image'lar muvaffaqiyatli build va push qilindi!${NC}"
echo ""
echo -e "${BLUE}📋 Keyingi qadamlar (EC2'da):${NC}"
echo "  1. SSH orqali EC2'ga kirish: ssh -i ~/Desktop/AWS/clinic-erp-key.pem ubuntu@${VPS_IP}"
echo "  2. Yangi image'larni pull qilish:"
echo "     docker pull ${DOCKER_USERNAME}/clinic-backend:latest"
echo "     docker pull ${DOCKER_USERNAME}/clinic-frontend:latest"
echo "     docker pull ${DOCKER_USERNAME}/supplier-backend:latest"
echo "     docker pull ${DOCKER_USERNAME}/supplier-frontend:latest"
echo "  3. Container'larni yangilash:"
echo "     cd ~/clinic-erp"
echo "     docker compose -f docker-compose.prod.yml pull"
echo "     docker compose -f docker-compose.prod.yml up -d --force-recreate"
echo ""
echo -e "${YELLOW}📖 To'liq qo'llanma: AWS_EC2_DEPLOYMENT_GUIDE.md${NC}"


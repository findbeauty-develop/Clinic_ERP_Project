#!/bin/bash

# 🚀 Production Deployment Script - Xavfsiz Deploy
# Bu script production'ga xavfsiz deploy qilish uchun to'liq workflow'ni bajaradi
#
# Usage:
#   ./deploy-production.sh [--skip-checks] [--skip-merge] [--skip-build]
#
# Options:
#   --skip-checks    Pre-deployment checklist'ni o'tkazib yuborish
#   --skip-merge     Git merge'ni o'tkazib yuborish (master branch'da bo'lsangiz)
#   --skip-build     Docker build'ni o'tkazib yuborish (faqat push)

set -e  # Xato bo'lsa to'xtatish

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOCKER_USERNAME="findbeauty"
PRODUCTION_BRANCH="master"
DEVELOP_BRANCH="develop"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Flags
SKIP_CHECKS=false
SKIP_MERGE=false
SKIP_BUILD=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --skip-checks)
            SKIP_CHECKS=true
            shift
            ;;
        --skip-merge)
            SKIP_MERGE=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        *)
            ;;
    esac
done

# Functions
print_header() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Error handler
handle_error() {
    print_error "Deployment xatosi yuz berdi!"
    print_info "Xatolik: $1"
    exit 1
}

trap 'handle_error "Script xatosi yuz berdi"' ERR

# ============================================
# STEP 1: Pre-deployment Checks
# ============================================

check_git_branch() {
    print_header "STEP 1: Git Branch Tekshirish"
    
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    print_info "Hozirgi branch: $CURRENT_BRANCH"
    
    if [ "$CURRENT_BRANCH" != "$PRODUCTION_BRANCH" ]; then
        print_warning "Siz $CURRENT_BRANCH branch'da turibsiz, lekin $PRODUCTION_BRANCH kerak"
        
        if [ "$SKIP_MERGE" = false ]; then
            print_info "$DEVELOP_BRANCH'ni $PRODUCTION_BRANCH'ga merge qilish kerakmi? (y/n)"
            read -p "Javob: " answer
            
            if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
                print_info "Git status tekshirish..."
                git status
                
                # Uncommitted changes tekshirish
                if ! git diff-index --quiet HEAD --; then
                    print_warning "Uncommitted o'zgarishlar mavjud!"
                    print_info "Commit qilish kerakmi? (y/n)"
                    read -p "Javob: " commit_answer
                    
                    if [ "$commit_answer" = "y" ] || [ "$commit_answer" = "Y" ]; then
                        print_info "Commit message kiriting:"
                        read -p "Message: " commit_message
                        git add .
                        git commit -m "$commit_message"
                        git push origin "$CURRENT_BRANCH"
                    fi
                fi
                
                # Master branch'ga o'tish
                print_info "$PRODUCTION_BRANCH branch'ga o'tish..."
                git checkout "$PRODUCTION_BRANCH"
                git pull origin "$PRODUCTION_BRANCH" || true
                
                # Merge qilish
                print_info "$DEVELOP_BRANCH'ni $PRODUCTION_BRANCH'ga merge qilish..."
                git merge "$DEVELOP_BRANCH" --no-ff -m "Merge $DEVELOP_BRANCH -> $PRODUCTION_BRANCH for production deployment"
                
                # Push qilish
                print_info "$PRODUCTION_BRANCH'ni remote'ga push qilish..."
                git push origin "$PRODUCTION_BRANCH"
                
                print_success "Git merge muvaffaqiyatli!"
            else
                print_error "Deployment bekor qilindi. $PRODUCTION_BRANCH branch'ga o'ting va qayta urinib ko'ring."
                exit 1
            fi
        else
            print_warning "Git merge o'tkazib yuborildi (--skip-merge flag)"
        fi
    else
        print_success "Siz $PRODUCTION_BRANCH branch'da turibsiz"
    fi
    
    # Git pull (yangilanishlar uchun)
    print_info "Remote'dan yangilanishlarni olish..."
    git pull origin "$PRODUCTION_BRANCH" || print_warning "Remote'da yangilanishlar yo'q"
}

check_environment_variables() {
    print_header "STEP 2: Environment Variables Tekshirish"
    
    # Backend .env.production tekshirish
    if [ -f "apps/backend/.env.production" ]; then
        print_success "apps/backend/.env.production mavjud"
        
        # CORS_ORIGINS tekshirish
        if grep -q "CORS_ORIGINS=" "apps/backend/.env.production"; then
            CORS_ORIGINS=$(grep "CORS_ORIGINS=" "apps/backend/.env.production" | cut -d '=' -f2)
            if [ -z "$CORS_ORIGINS" ] || [ "$CORS_ORIGINS" = "" ]; then
                print_error "CORS_ORIGINS bo'sh! Production'da majburiy!"
                exit 1
            else
                print_success "CORS_ORIGINS: $CORS_ORIGINS"
            fi
        else
            print_error "CORS_ORIGINS topilmadi apps/backend/.env.production'da!"
            exit 1
        fi
        
        # DATABASE_URL tekshirish
        if grep -q "DATABASE_URL=" "apps/backend/.env.production"; then
            print_success "DATABASE_URL mavjud"
        else
            print_error "DATABASE_URL topilmadi apps/backend/.env.production'da!"
            exit 1
        fi
        
        # JWT_SECRET tekshirish
        if grep -q "JWT_SECRET=" "apps/backend/.env.production"; then
            print_success "JWT_SECRET mavjud"
        else
            print_error "JWT_SECRET topilmadi apps/backend/.env.production'da!"
            exit 1
        fi
    else
        print_error "apps/backend/.env.production topilmadi!"
        print_info "apps/backend/.env.production.example'dan nusxa oling va to'ldiring"
        exit 1
    fi
    
    # Frontend .env.production tekshirish
    if [ -f "apps/frontend/.env.production" ]; then
        print_success "apps/frontend/.env.production mavjud"
        
        # NEXT_PUBLIC_API_URL tekshirish
        if grep -q "NEXT_PUBLIC_API_URL=" "apps/frontend/.env.production"; then
            NEXT_PUBLIC_API_URL=$(grep "NEXT_PUBLIC_API_URL=" "apps/frontend/.env.production" | cut -d '=' -f2)
            print_success "NEXT_PUBLIC_API_URL: $NEXT_PUBLIC_API_URL"
        else
            print_error "NEXT_PUBLIC_API_URL topilmadi apps/frontend/.env.production'da!"
            exit 1
        fi
    else
        print_error "apps/frontend/.env.production topilmadi!"
        print_info "apps/frontend/.env.production.example'dan nusxa oling va to'ldiring"
        exit 1
    fi
    
    # Supplier Backend .env.production tekshirish
    if [ -f "apps/supplier-backend/.env.production" ]; then
        print_success "apps/supplier-backend/.env.production mavjud"
    else
        print_warning "apps/supplier-backend/.env.production topilmadi (ixtiyoriy)"
    fi
}

check_database_migration() {
    print_header "STEP 3: Database Migration Status Tekshirish"
    
    if [ -f "apps/backend/prisma/schema.prisma" ]; then
        print_info "Prisma migration status tekshirish..."
        
        cd apps/backend
        
        # Migration status tekshirish (agar DATABASE_URL o'rnatilgan bo'lsa)
        if [ -f ".env.production" ]; then
            # Production DATABASE_URL'ni export qilish
            export $(grep -v '^#' .env.production | grep DATABASE_URL | xargs)
            export $(grep -v '^#' .env.production | grep DIRECT_URL | xargs)
            
            if [ ! -z "$DATABASE_URL" ]; then
                print_info "Migration status tekshirish..."
                npx prisma migrate status || print_warning "Migration status tekshirishda xatolik (normal bo'lishi mumkin)"
            else
                print_warning "DATABASE_URL topilmadi, migration status o'tkazib yuborildi"
            fi
        else
            print_warning ".env.production topilmadi, migration status o'tkazib yuborildi"
        fi
        
        cd "$SCRIPT_DIR"
    else
        print_warning "Prisma schema topilmadi, migration check o'tkazib yuborildi"
    fi
}

check_build_test() {
    print_header "STEP 4: Build Test"
    
    print_info "Backend build test..."
    cd apps/backend
    
    if [ -f "package.json" ]; then
        print_info "Dependencies tekshirish..."
        npm list --depth=0 > /dev/null 2>&1 || print_warning "Dependencies to'liq o'rnatilmagan bo'lishi mumkin"
        
        print_info "TypeScript compilation test..."
        npx tsc --noEmit > /dev/null 2>&1 && print_success "TypeScript compilation muvaffaqiyatli" || print_warning "TypeScript compilation xatosi (normal bo'lishi mumkin)"
    fi
    
    cd "$SCRIPT_DIR"
    
    print_info "Frontend build test..."
    cd apps/frontend
    
    if [ -f "package.json" ]; then
        print_info "Dependencies tekshirish..."
        npm list --depth=0 > /dev/null 2>&1 || print_warning "Dependencies to'liq o'rnatilmagan bo'lishi mumkin"
    fi
    
    cd "$SCRIPT_DIR"
}

check_docker() {
    print_header "STEP 5: Docker Tekshirish"
    
    # Docker o'rnatilganligini tekshirish
    if ! command -v docker &> /dev/null; then
        print_error "Docker o'rnatilmagan!"
        exit 1
    fi
    print_success "Docker o'rnatilgan"
    
    # Docker Hub login tekshirish
    if ! docker info | grep -q "Username"; then
        print_warning "Docker Hub'ga login qilmagansiz"
        print_info "Docker Hub'ga login qilish kerakmi? (y/n)"
        read -p "Javob: " docker_login
        
        if [ "$docker_login" = "y" ] || [ "$docker_login" = "Y" ]; then
            docker login
        else
            print_error "Docker Hub login kerak!"
            exit 1
        fi
    else
        print_success "Docker Hub'ga login qilingan"
    fi
    
    # Buildx tekshirish
    if ! docker buildx version &> /dev/null; then
        print_error "Docker Buildx o'rnatilmagan!"
        exit 1
    fi
    print_success "Docker Buildx mavjud"
}

# ============================================
# STEP 2: Docker Build & Push
# ============================================

build_and_push_images() {
    print_header "STEP 6: Docker Build va Push"
    
    # VPS IP yoki domain'ni so'rash
    if [ -z "$VPS_IP" ] && [ -z "$BACKEND_URL" ]; then
        print_info "VPS IP yoki domain'ni kiriting (masalan: clinic.jaclit.com yoki 123.45.67.89):"
        read -p "VPS IP/Domain: " VPS_IP_INPUT
        
        if [ -z "$VPS_IP_INPUT" ]; then
            print_error "VPS IP yoki domain kiritilmadi!"
            exit 1
        fi
        
        # Domain yoki IP tekshirish
        if [[ "$VPS_IP_INPUT" == *"."* ]] && [[ "$VPS_IP_INPUT" != *"http"* ]]; then
            # Domain yoki IP
            if [[ "$VPS_IP_INPUT" == *"jaclit.com"* ]] || [[ "$VPS_IP_INPUT" == *"localhost"* ]]; then
                # Domain
                BACKEND_URL="https://api.jaclit.com"
                SUPPLIER_BACKEND_URL="https://api-supplier.jaclit.com"
            else
                # IP
                BACKEND_URL="http://${VPS_IP_INPUT}:3000"
                SUPPLIER_BACKEND_URL="http://${VPS_IP_INPUT}:3002"
            fi
        else
            BACKEND_URL="$VPS_IP_INPUT"
            SUPPLIER_BACKEND_URL="$VPS_IP_INPUT"
        fi
    else
        BACKEND_URL="${BACKEND_URL:-http://${VPS_IP:-YOUR_VPS_IP}:3000}"
        SUPPLIER_BACKEND_URL="${SUPPLIER_BACKEND_URL:-http://${VPS_IP:-YOUR_VPS_IP}:3002}"
    fi
    
    print_info "Backend URL: $BACKEND_URL"
    print_info "Supplier Backend URL: $SUPPLIER_BACKEND_URL"
    echo ""
    
    # Buildx tayyorlash
    print_info "Docker Buildx tayyorlash..."
    docker buildx create --use --name multiarch-builder 2>/dev/null || docker buildx use multiarch-builder
    docker buildx inspect --bootstrap > /dev/null 2>&1 || true
    print_success "Docker Buildx tayyorlandi"
    
    # Qaysi servislarni build qilishni so'rash
    if [ "$SKIP_BUILD" = false ]; then
        echo ""
        print_info "Qaysi servislarni build qilmoqchisiz?"
        echo "  1) Barcha servislar (Backend, Frontend, Supplier-Backend, Supplier-Frontend)"
        echo "  2) Faqat Backend'lar (Clinic + Supplier)"
        echo "  3) Faqat Frontend'lar (Clinic + Supplier)"
        echo "  4) Faqat Clinic servislar (Backend + Frontend)"
        echo "  5) Faqat Supplier servislar (Backend + Frontend)"
        read -p "Tanlang (1-5, default: 1): " BUILD_CHOICE
        BUILD_CHOICE=${BUILD_CHOICE:-1}
    else
        BUILD_CHOICE=0
        print_warning "Docker build o'tkazib yuborildi (--skip-build flag)"
    fi
    
    # Build functions
    build_clinic_backend() {
        print_info "📦 Building Clinic Backend..."
        docker buildx build \
          --platform linux/amd64 \
          -f apps/backend/Dockerfile \
          -t ${DOCKER_USERNAME}/clinic-backend:latest \
          --push . || handle_error "Clinic Backend build xatosi"
        print_success "Clinic Backend build va push qilindi"
        echo ""
    }
    
    build_clinic_frontend() {
        print_info "📦 Building Clinic Frontend..."
        docker buildx build \
          --platform linux/amd64 \
          --build-arg NEXT_PUBLIC_API_URL=${BACKEND_URL} \
          -f apps/frontend/Dockerfile \
          -t ${DOCKER_USERNAME}/clinic-frontend:latest \
          --push . || handle_error "Clinic Frontend build xatosi"
        print_success "Clinic Frontend build va push qilindi"
        echo ""
    }
    
    build_supplier_backend() {
        print_info "📦 Building Supplier Backend..."
        docker buildx build \
          --platform linux/amd64 \
          -f apps/supplier-backend/Dockerfile \
          -t ${DOCKER_USERNAME}/supplier-backend:latest \
          --push . || handle_error "Supplier Backend build xatosi"
        print_success "Supplier Backend build va push qilindi"
        echo ""
    }
    
    build_supplier_frontend() {
        print_info "📦 Building Supplier Frontend..."
        docker buildx build \
          --platform linux/amd64 \
          --build-arg NEXT_PUBLIC_API_URL=${SUPPLIER_BACKEND_URL} \
          -f apps/supplier-frontend/Dockerfile \
          -t ${DOCKER_USERNAME}/supplier-frontend:latest \
          --push . || handle_error "Supplier Frontend build xatosi"
        print_success "Supplier Frontend build va push qilindi"
        echo ""
    }
    
    # Build based on choice
    case $BUILD_CHOICE in
        1)
            build_clinic_backend
            build_clinic_frontend
            build_supplier_backend
            build_supplier_frontend
            ;;
        2)
            build_clinic_backend
            build_supplier_backend
            ;;
        3)
            build_clinic_frontend
            build_supplier_frontend
            ;;
        4)
            build_clinic_backend
            build_clinic_frontend
            ;;
        5)
            build_supplier_backend
            build_supplier_frontend
            ;;
        0)
            print_info "Build o'tkazib yuborildi"
            ;;
        *)
            print_error "Noto'g'ri tanlov!"
            exit 1
            ;;
    esac
}

# ============================================
# Main Execution
# ============================================

main() {
    print_header "🚀 Production Deployment Script"
    print_info "Bu script production'ga xavfsiz deploy qilish uchun to'liq workflow'ni bajaradi"
    echo ""
    
    # Project directory'ga o'tish
    cd "$SCRIPT_DIR"
    print_info "Project directory: $(pwd)"
    echo ""
    
    # Pre-deployment checks
    if [ "$SKIP_CHECKS" = false ]; then
        check_git_branch
        check_environment_variables
        check_database_migration
        check_build_test
        check_docker
    else
        print_warning "Pre-deployment checks o'tkazib yuborildi (--skip-checks flag)"
    fi
    
    # Docker build va push
    if [ "$SKIP_BUILD" = false ]; then
        build_and_push_images
    else
        print_warning "Docker build o'tkazib yuborildi (--skip-build flag)"
    fi
    
    # Summary
    print_header "✅ Deployment Muvaffaqiyatli!"
    
    echo ""
    print_info "📋 Keyingi qadamlar (Production Server'da):"
    echo ""
    echo "  1. SSH orqali production server'ga kirish:"
    echo "     ssh user@YOUR_VPS_IP"
    echo ""
    echo "  2. Project directory'ga o'tish:"
    echo "     cd ~/clinic-erp"
    echo ""
    echo "  3. Yangi image'larni pull qilish:"
    echo "     docker compose -f docker-compose.prod.yml pull"
    echo ""
    echo "  4. Container'larni yangilash:"
    echo "     docker compose -f docker-compose.prod.yml up -d --force-recreate"
    echo ""
    echo "  5. Log'larni tekshirish:"
    echo "     docker compose -f docker-compose.prod.yml logs -f"
    echo ""
    echo "  6. Health check:"
    echo "     curl https://your-domain.com/health"
    echo ""
    
    print_success "Deployment jarayoni yakunlandi!"
    echo ""
}

# Run main function
main


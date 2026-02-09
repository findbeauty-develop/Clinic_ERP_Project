#!/bin/bash

# 🧪 Comprehensive Cyber Attack Test Script
# Bu script barcha attack types'ni test qiladi

BASE_URL="${BASE_URL:-http://localhost:3000}"
METRICS_URL="${METRICS_URL:-http://localhost:3000/metrics}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}🧪 Comprehensive Cyber Attack Test Suite${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Function to get metric count
get_metric_count() {
    local attack_type=$1
    local count=$(curl -s "$METRICS_URL" | grep "cyber_attacks_total{attack_type=\"$attack_type\"" | head -1 | sed -n 's/.*} \([0-9]*\)$/\1/p')
    echo "${count:-0}"
}

# Function to get initial metrics
get_initial_metrics() {
    echo -e "${YELLOW}📊 Initial Metrics...${NC}"
    echo "Path Traversal: $(get_metric_count 'path_traversal')"
    echo "SQL Injection: $(get_metric_count 'sql_injection')"
    echo "XSS: $(get_metric_count 'xss')"
    echo "Brute Force: $(get_metric_count 'brute_force')"
    echo "DDoS: $(get_metric_count 'ddos')"
    echo "Suspicious User-Agent: $(get_metric_count 'suspicious_user_agent')"
    echo "Unauthorized Access: $(get_metric_count 'unauthorized_access')"
    echo ""
}

# Function to wait for metrics update
wait_for_metrics() {
    sleep 2
}

# Function to show test results
show_results() {
    local attack_type=$1
    local initial=$2
    local final=$(get_metric_count "$attack_type")
    local detected=$((final - initial))
    
    if [ "$detected" -gt 0 ]; then
        echo -e "${GREEN}✅ $attack_type: $detected attack(s) detected${NC}"
    else
        echo -e "${RED}❌ $attack_type: No attack detected${NC}"
    fi
}

# ==========================================
# 1. PATH TRAVERSAL ATTACKS
# ==========================================
test_path_traversal() {
    echo -e "${BLUE}1️⃣  Testing Path Traversal Attacks...${NC}"
    local initial=$(get_metric_count 'path_traversal')
    
    # Test 1: Basic path traversal
    curl -s "$BASE_URL/api/files/../../../etc/passwd" > /dev/null
    
    # Test 2: URL encoded
    curl -s "$BASE_URL/api/files/..%2F..%2F..%2Fetc%2Fpasswd" > /dev/null
    
    # Test 3: Double encoded
    curl -s "$BASE_URL/api/files/%252E%252E%252F%252E%252E%252F%252E%252E%252Fetc%252Fpasswd" > /dev/null
    
    # Test 4: Query parameter
    curl -s "$BASE_URL/api/test?path=../../../etc/passwd" > /dev/null
    
    # Test 5: Body parameter
    curl -s -X POST "$BASE_URL/api/test" \
        -H "Content-Type: application/json" \
        -d '{"path":"../../../etc/passwd"}' > /dev/null
    
    wait_for_metrics
    show_results 'path_traversal' "$initial"
    echo ""
}

# ==========================================
# 2. SQL INJECTION ATTACKS
# ==========================================
test_sql_injection() {
    echo -e "${BLUE}2️⃣  Testing SQL Injection Attacks...${NC}"
    local initial=$(get_metric_count 'sql_injection')
    
    # Test 1: Basic SQL injection in query
    curl -s "$BASE_URL/hira/search?yadmNm=' OR '1'='1" > /dev/null
    
    # Test 2: UNION SELECT
    curl -s "$BASE_URL/hira/search?yadmNm=test' UNION SELECT * FROM users--" > /dev/null
    
    # Test 3: URL encoded
    curl -s "$BASE_URL/hira/search?yadmNm=test%27%20UNION%20SELECT%20*%20FROM%20users--" > /dev/null
    
    # Test 4: Body parameter
    curl -s -X POST "$BASE_URL/products" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer fake-token" \
        -d '{"name":"test'\'' OR '\''1'\''='\''1","code":"TEST"}' > /dev/null
    
    # Test 5: Multiple SQL patterns
    curl -s "$BASE_URL/hira/search?yadmNm=admin'--" > /dev/null
    curl -s "$BASE_URL/hira/search?yadmNm=1' OR '1'='1'--" > /dev/null
    
    wait_for_metrics
    show_results 'sql_injection' "$initial"
    echo ""
}

# ==========================================
# 3. XSS ATTACKS
# ==========================================
test_xss() {
    echo -e "${BLUE}3️⃣  Testing XSS Attacks...${NC}"
    local initial=$(get_metric_count 'xss')
    
    # Test 1: Basic script tag
    curl -s -X POST "$BASE_URL/api/test" \
        -H "Content-Type: application/json" \
        -d '{"name":"<script>alert(1)</script>"}' > /dev/null
    
    # Test 2: URL encoded script
    curl -s "$BASE_URL/api/calendar/lunar-to-solar?year=2024&month=%3Cscript%3Ealert%28%27XSS%27%29%3C%2Fscript%3E&day=1" > /dev/null
    
    # Test 3: iframe XSS
    curl -s -X POST "$BASE_URL/api/test" \
        -H "Content-Type: application/json" \
        -d '{"inquiry":"<iframe src=\"javascript:alert(1)\"></iframe>"}' > /dev/null
    
    # Test 4: Event handler XSS
    curl -s "$BASE_URL/hira/search?yadmNm=test\" onclick=\"alert(1)\"" > /dev/null
    
    # Test 5: JavaScript protocol
    curl -s "$BASE_URL/hira/search?yadmNm=javascript:alert(1)" > /dev/null
    
    wait_for_metrics
    show_results 'xss' "$initial"
    echo ""
}

# ==========================================
# 4. BRUTE FORCE ATTACKS
# ==========================================
test_brute_force() {
    echo -e "${BLUE}4️⃣  Testing Brute Force Attacks...${NC}"
    local initial=$(get_metric_count 'brute_force')
    
    # 6 ta failed login (threshold = 5)
    for i in {1..6}; do
        curl -s -X POST "$BASE_URL/iam/members/login" \
            -H "Content-Type: application/json" \
            -d "{\"memberId\":\"test\",\"password\":\"wrong_password_$i\"}" > /dev/null
        sleep 0.5
    done
    
    wait_for_metrics
    show_results 'brute_force' "$initial"
    echo ""
}

# ==========================================
# 5. DDOS ATTACKS
# ==========================================
test_ddos() {
    echo -e "${BLUE}5️⃣  Testing DDoS Attacks...${NC}"
    local initial=$(get_metric_count 'ddos')
    
    echo "   Sending 150 requests (this may take a moment)..."
    
    # 150 ta parallel request (threshold = 100)
    for i in {1..150}; do
        curl -s "$BASE_URL/api/products" > /dev/null &
        
        # Progress indicator
        if [ $((i % 50)) -eq 0 ]; then
            echo "   Progress: $i/150 requests sent..."
        fi
    done
    
    wait # Wait for all background jobs
    wait_for_metrics
    show_results 'ddos' "$initial"
    echo ""
}

# ==========================================
# 6. SUSPICIOUS USER-AGENT ATTACKS
# ==========================================
test_suspicious_user_agent() {
    echo -e "${BLUE}6️⃣  Testing Suspicious User-Agent Attacks...${NC}"
    local initial=$(get_metric_count 'suspicious_user_agent')
    
    # Test 1: sqlmap
    curl -s -H "User-Agent: sqlmap/1.0" "$BASE_URL/api/products" > /dev/null
    
    # Test 2: nmap
    curl -s -H "User-Agent: nmap" "$BASE_URL/api/products" > /dev/null
    
    # Test 3: Empty user-agent
    curl -s -H "User-Agent: " "$BASE_URL/api/products" > /dev/null
    
    # Test 4: w3af
    curl -s -H "User-Agent: w3af" "$BASE_URL/api/products" > /dev/null
    
    # Test 5: nikto
    curl -s -H "User-Agent: nikto" "$BASE_URL/api/products" > /dev/null
    
    # Test 6: acunetix
    curl -s -H "User-Agent: acunetix" "$BASE_URL/api/products" > /dev/null
    
    wait_for_metrics
    show_results 'suspicious_user_agent' "$initial"
    echo ""
}

# ==========================================
# 7. UNAUTHORIZED ACCESS ATTACKS
# ==========================================
test_unauthorized_access() {
    echo -e "${BLUE}7️⃣  Testing Unauthorized Access Attacks...${NC}"
    local initial=$(get_metric_count 'unauthorized_access')
    
    # Test 1: Invalid token (401)
    curl -s -X GET "$BASE_URL/products" \
        -H "Authorization: Bearer invalid_token_12345" > /dev/null
    
    # Test 2: Expired token (401)
    curl -s -X GET "$BASE_URL/products" \
        -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired" > /dev/null
    
    # Test 3: Missing token (401)
    curl -s -X GET "$BASE_URL/products" > /dev/null
    
    # Test 4: Malformed token (401)
    curl -s -X GET "$BASE_URL/products" \
        -H "Authorization: Bearer malformed.token.here" > /dev/null
    
    # Test 5: Protected endpoint without auth (401)
    curl -s -X GET "$BASE_URL/api/members" > /dev/null
    
    wait_for_metrics
    show_results 'unauthorized_access' "$initial"
    echo ""
}

# ==========================================
# MAIN EXECUTION
# ==========================================

# ✅ Save initial metrics BEFORE running tests
echo -e "${YELLOW}📊 Initial metrics...${NC}"
INITIAL_PATH=$(get_metric_count 'path_traversal')
INITIAL_SQL=$(get_metric_count 'sql_injection')
INITIAL_XSS=$(get_metric_count 'xss')
INITIAL_BRUTE=$(get_metric_count 'brute_force')
INITIAL_DDOS=$(get_metric_count 'ddos')
INITIAL_USER_AGENT=$(get_metric_count 'suspicious_user_agent')
INITIAL_UNAUTHORIZED=$(get_metric_count 'unauthorized_access')

echo "Path Traversal: $INITIAL_PATH"
echo "SQL Injection: $INITIAL_SQL"
echo "XSS: $INITIAL_XSS"
echo "Brute Force: $INITIAL_BRUTE"
echo "DDoS: $INITIAL_DDOS"
echo "Suspicious User-Agent: $INITIAL_USER_AGENT"
echo "Unauthorized Access: $INITIAL_UNAUTHORIZED"
echo ""

echo -e "${BLUE}🚀 Starting Attack Tests...${NC}"
echo ""

# Run all tests
test_path_traversal
test_sql_injection
test_xss
test_brute_force
test_ddos
test_suspicious_user_agent
test_unauthorized_access

# Wait for all metrics to update
echo -e "${YELLOW}⏳ Waiting for metrics to update...${NC}"
sleep 3

# Final results
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}📊 Final Metrics...${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

echo -e "${YELLOW}📈 Test Results:${NC}"
echo -e "${BLUE}==========================================${NC}"

# ✅ Calculate and show results using saved initial values
FINAL_PATH=$(get_metric_count 'path_traversal')
FINAL_SQL=$(get_metric_count 'sql_injection')
FINAL_XSS=$(get_metric_count 'xss')
FINAL_BRUTE=$(get_metric_count 'brute_force')
FINAL_DDOS=$(get_metric_count 'ddos')
FINAL_USER_AGENT=$(get_metric_count 'suspicious_user_agent')
FINAL_UNAUTHORIZED=$(get_metric_count 'unauthorized_access')

PATH_DETECTED=$((FINAL_PATH - INITIAL_PATH))
SQL_DETECTED=$((FINAL_SQL - INITIAL_SQL))
XSS_DETECTED=$((FINAL_XSS - INITIAL_XSS))
BRUTE_DETECTED=$((FINAL_BRUTE - INITIAL_BRUTE))
DDOS_DETECTED=$((FINAL_DDOS - INITIAL_DDOS))
USER_AGENT_DETECTED=$((FINAL_USER_AGENT - INITIAL_USER_AGENT))
UNAUTHORIZED_DETECTED=$((FINAL_UNAUTHORIZED - INITIAL_UNAUTHORIZED))

[ "$PATH_DETECTED" -gt 0 ] && echo -e "${GREEN}✅ Path Traversal: $PATH_DETECTED attack(s) detected${NC}" || echo -e "${RED}❌ Path Traversal: No attack detected${NC}"
[ "$SQL_DETECTED" -gt 0 ] && echo -e "${GREEN}✅ SQL Injection: $SQL_DETECTED attack(s) detected${NC}" || echo -e "${RED}❌ SQL Injection: No attack detected${NC}"
[ "$XSS_DETECTED" -gt 0 ] && echo -e "${GREEN}✅ XSS: $XSS_DETECTED attack(s) detected${NC}" || echo -e "${RED}❌ XSS: No attack detected${NC}"
[ "$BRUTE_DETECTED" -gt 0 ] && echo -e "${GREEN}✅ Brute Force: $BRUTE_DETECTED attack(s) detected${NC}" || echo -e "${RED}❌ Brute Force: No attack detected${NC}"
[ "$DDOS_DETECTED" -gt 0 ] && echo -e "${GREEN}✅ DDoS: $DDOS_DETECTED attack(s) detected${NC}" || echo -e "${RED}❌ DDoS: No attack detected${NC}"
[ "$USER_AGENT_DETECTED" -gt 0 ] && echo -e "${GREEN}✅ Suspicious User-Agent: $USER_AGENT_DETECTED attack(s) detected${NC}" || echo -e "${RED}❌ Suspicious User-Agent: No attack detected${NC}"
[ "$UNAUTHORIZED_DETECTED" -gt 0 ] && echo -e "${GREEN}✅ Unauthorized Access: $UNAUTHORIZED_DETECTED attack(s) detected${NC}" || echo -e "${RED}❌ Unauthorized Access: No attack detected${NC}"

echo ""
echo -e "${BLUE}==========================================${NC}"
echo -e "${YELLOW}📊 All Metrics:${NC}"
echo -e "${BLUE}==========================================${NC}"
curl -s "$METRICS_URL" | grep "cyber_attacks_total" | grep -v "#" | sort

echo ""
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}✅ Test Complete!${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo -e "${YELLOW}💡 Next Steps:${NC}"
echo "   1. Check Grafana dashboard: http://YOUR_VPS_IP:3004"
echo "   2. View Prometheus: http://YOUR_VPS_IP:9090"
echo "   3. Check backend logs: docker-compose logs backend | grep CYBER"
echo ""



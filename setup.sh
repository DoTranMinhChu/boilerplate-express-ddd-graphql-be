#!/bin/bash

echo "🚀 Enterprise Backend DDD - Auto Setup Script"
echo "=============================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js
echo -e "\n${YELLOW}Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js >= 18${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node --version) found${NC}"

# Check PostgreSQL
echo -e "\n${YELLOW}Checking PostgreSQL...${NC}"
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ PostgreSQL found${NC}"

# Install dependencies
echo -e "\n${YELLOW}Installing dependencies...${NC}"
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

# Setup .env
echo -e "\n${YELLOW}Setting up environment variables...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✅ .env file created${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env file with your configuration${NC}"
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi

# Create logs directory
echo -e "\n${YELLOW}Creating logs directory...${NC}"
mkdir -p logs
echo -e "${GREEN}✅ Logs directory created${NC}"

# Create database
echo -e "\n${YELLOW}Creating database...${NC}"
read -p "Do you want to create PostgreSQL database? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter database name (default: enterprise_db): " DB_NAME
    DB_NAME=${DB_NAME:-enterprise_db}
    
    read -p "Enter PostgreSQL username (default: postgres): " DB_USER
    DB_USER=${DB_USER:-postgres}
    
    createdb -U $DB_USER $DB_NAME 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Database '$DB_NAME' created${NC}"
    else
        echo -e "${YELLOW}⚠️  Database might already exist or creation failed${NC}"
    fi
fi

# Build TypeScript
echo -e "\n${YELLOW}Building TypeScript...${NC}"
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ TypeScript build successful${NC}"
else
    echo -e "${YELLOW}⚠️  Build failed. Will use ts-node in dev mode${NC}"
fi

# Final message
echo -e "\n${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                   ║${NC}"
echo -e "${GREEN}║  ✅ Setup completed successfully!                 ║${NC}"
echo -e "${GREEN}║                                                   ║${NC}"
echo -e "${GREEN}║  Next steps:                                      ║${NC}"
echo -e "${GREEN}║  1. Edit .env file with your configuration        ║${NC}"
echo -e "${GREEN}║  2. Run: npm run dev                              ║${NC}"
echo -e "${GREEN}║  3. Open: http://localhost:3000                   ║${NC}"
echo -e "${GREEN}║                                                   ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
/**
 * Script to create initial Super Admin
 * Usage: node scripts/create-super-admin.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Client } = require('pg');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function createSuperAdmin() {
    console.log('🚀 Create Super Admin Script\n');

    try {
        // Get user input
        const username = await question('Username: ');
        const password = await question('Password: ');
        const firstName = await question('First Name: ');
        const lastName = await question('Last Name: ');

        // Validate
        if (!username || !password || !firstName || !lastName) {
            console.error('❌ All fields are required');
            process.exit(1);
        }

        // Hash password
        console.log('\n⏳ Hashing password...');
        const hashedPassword = await bcrypt.hash(password, 10);

        // Connect to database
        console.log('⏳ Connecting to database...');
        const client = new Client({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            user: process.env.DB_USERNAME || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            database: process.env.DB_DATABASE || 'enterprise_db',
            // Tôn trọng DB_SSL: chỉ bật SSL khi =true (Neon). Server không hỗ trợ SSL
            // (vd Postgres trên VPS) thì DB_SSL=false để tránh "server does not support SSL".
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        });

        await client.connect();
        console.log('✅ Connected to database');

        // Check if admin exists
        const checkQuery = 'SELECT * FROM admin WHERE username = $1';
        const checkResult = await client.query(checkQuery, [username]);

        if (checkResult.rows.length > 0) {
            console.error('❌ Admin with this username already exists');
            await client.end();
            process.exit(1);
        }

        // Insert super admin
        console.log('⏳ Creating super admin...');
        const insertQuery = `
      INSERT INTO admin (
        id, username, password, "firstName", "lastName", 
        roles, "isActivated", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, 
        'SUPER_ADMIN', true, NOW(), NOW()
      ) RETURNING *
    `;

        const result = await client.query(insertQuery, [
            username,
            hashedPassword,
            firstName,
            lastName
        ]);

        const admin = result.rows[0];

        console.log('\n✅ Super Admin created successfully!\n');
        console.log('Details:');
        console.log('  ID:', admin.id);
        console.log('  Username:', admin.username);
        console.log('  Name:', `${admin.firstName} ${admin.lastName}`);
        console.log('  Roles:', admin.roles);

        console.log('\n🔑 You can now login with:');
        console.log(`  Username: ${username}`);
        console.log(`  Password: ${password}`);

        await client.end();

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

createSuperAdmin();
/**
 * Seed Script — Create test accounts, fund wallets, create events, mint tickets.
 *
 * Usage: node scripts/seed.js
 *
 * Creates:
 *   - Organizer account (organizer@test.com / password123)
 *   - Fan 1 account (fan1@test.com / password123)
 *   - Fan 2 account (fan2@test.com / password123)
 *   - Sample event with 3 minted tickets
 */

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const BASE = 'http://localhost:3000';

async function api(endpoint, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${endpoint}`, opts);
  const data = await res.json();
  if (!data.success) throw new Error(`${endpoint}: ${data.error}`);
  return data;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🌱 Seeding Test Data');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Create accounts
  console.log('👤 Creating organizer account...');
  let organizer;
  try {
    organizer = await api('/api/auth/signup', 'POST', {
      email: 'organizer@test.com',
      password: 'password123',
      displayName: 'Event Organizer',
      role: 'organizer',
    });
    console.log(`  ✅ Organizer: ${organizer.user.wallet}`);
  } catch (err) {
    console.log(`  ⚠️ ${err.message} — trying login...`);
    organizer = await api('/api/auth/login', 'POST', {
      email: 'organizer@test.com',
      password: 'password123',
    });
    console.log(`  ✅ Logged in as organizer`);
  }

  console.log('\n👤 Creating fan1 account...');
  let fan1;
  try {
    fan1 = await api('/api/auth/signup', 'POST', {
      email: 'fan1@test.com',
      password: 'password123',
      displayName: 'Alice (Fan)',
      role: 'fan',
    });
    console.log(`  ✅ Fan 1: ${fan1.user.wallet}`);
  } catch (err) {
    console.log(`  ⚠️ ${err.message} — trying login...`);
    fan1 = await api('/api/auth/login', 'POST', {
      email: 'fan1@test.com',
      password: 'password123',
    });
    console.log(`  ✅ Logged in as fan1`);
  }

  console.log('\n👤 Creating fan2 account...');
  let fan2;
  try {
    fan2 = await api('/api/auth/signup', 'POST', {
      email: 'fan2@test.com',
      password: 'password123',
      displayName: 'Bob (Fan)',
      role: 'fan',
    });
    console.log(`  ✅ Fan 2: ${fan2.user.wallet}`);
  } catch (err) {
    console.log(`  ⚠️ ${err.message} — trying login...`);
    fan2 = await api('/api/auth/login', 'POST', {
      email: 'fan2@test.com',
      password: 'password123',
    });
    console.log(`  ✅ Logged in as fan2`);
  }

  // 2. Fund fan wallets with RLUSD
  console.log('\n💵 Funding fan wallets with RLUSD...');
  try {
    await api('/api/wallet/fund-rlusd', 'POST', { amount: '1000' }, fan1.token);
    console.log('  ✅ Fan 1 funded with 1000 RLUSD');
  } catch (err) {
    console.log(`  ⚠️ Fan 1 fund: ${err.message}`);
  }

  try {
    await api('/api/wallet/fund-rlusd', 'POST', { amount: '1000' }, fan2.token);
    console.log('  ✅ Fan 2 funded with 1000 RLUSD');
  } catch (err) {
    console.log(`  ⚠️ Fan 2 fund: ${err.message}`);
  }

  // 3. Create an event
  console.log('\n🎪 Creating sample event...');
  const event = await api('/api/events', 'POST', {
    name: 'Blockchain Music Festival 2026',
    description: 'The biggest blockchain-powered music festival! All tickets are NFTs on the XRP Ledger.',
    date: '2026-12-31T20:00:00Z',
    venue: 'Crypto Arena, San Francisco',
  }, organizer.token);
  console.log(`  ✅ Event: ${event.event.name} (${event.event.id})`);

  // 4. Mint tickets
  console.log('\n🎫 Minting tickets...');
  const seats = [
    { seat: 'VIP-A101', originalPrice: '150', maxResalePrice: '200', maxResales: 3 },
    { seat: 'VIP-A102', originalPrice: '150', maxResalePrice: '200', maxResales: 3 },
    { seat: 'GA-B201', originalPrice: '75', maxResalePrice: '100', maxResales: 2 },
  ];

  const minted = await api('/api/tickets/mint', 'POST', {
    eventId: event.event.id,
    seats,
  }, organizer.token);
  console.log(`  ✅ Minted ${minted.tickets.length} tickets:`);
  minted.tickets.forEach(t => console.log(`     ${t.seat} → ${t.tokenId.slice(0, 20)}...`));

  // 5. Show summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ✅ Seed Complete!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n  Test Accounts:');
  console.log('    organizer@test.com / password123 (Organizer)');
  console.log('    fan1@test.com / password123 (Fan - Alice)');
  console.log('    fan2@test.com / password123 (Fan - Bob)');
  console.log('\n  Both fans have 1000 RLUSD for testing.\n');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

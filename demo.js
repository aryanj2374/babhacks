/**
 * ═══════════════════════════════════════════════════════════════════
 * XRPL Anti-Scalping Ticketing System — CLI Demo
 * ═══════════════════════════════════════════════════════════════════
 * 
 * This script demonstrates the full ticket lifecycle on XRPL Testnet:
 * 
 *   Step 1: Create & fund wallets (Organizer, Fan1, Fan2)
 *   Step 2: Issue simulated RLUSD stablecoin
 *   Step 3: Organizer mints NFT tickets
 *   Step 4: Fan1 buys a ticket (primary sale)
 *   Step 5: Fan1 attempts to resell above max price (BLOCKED by anti-scalping)
 *   Step 6: Fan1 resells to Fan2 at valid price (royalty auto-paid)
 *   Step 7: Verify ticket ownership
 * 
 * Usage: node demo.js
 */

const xrpl = require('xrpl');
const config = require('./src/config');
const { createFundedWallet, establishTrustLine, fundRLUSD, getRLUSDBalance } = require('./src/wallet');
const { mintTicket, buyTicket, resellTicket, verifyTicket } = require('./src/ticket');
const { sleep } = require('./src/utils');

const DIVIDER = '═'.repeat(60);

async function main() {
  console.log('\n' + DIVIDER);
  console.log('  🎫 XRPL Anti-Scalping Ticketing System — Demo');
  console.log(DIVIDER + '\n');

  // Connect to XRPL Testnet
  const client = new xrpl.Client(config.XRPL_SERVER);
  console.log('📡 Connecting to XRPL Testnet...');
  await client.connect();
  console.log('✅ Connected!\n');

  try {
    // ── STEP 1: Create & Fund Wallets ──────────────────────────────
    console.log(DIVIDER);
    console.log('  STEP 1: Creating & Funding Wallets');
    console.log(DIVIDER);

    console.log('\n🏢 Creating Organizer wallet...');
    const organizer = await createFundedWallet(client);
    await sleep(1000);

    console.log('\n👤 Creating Fan1 wallet...');
    const fan1 = await createFundedWallet(client);
    await sleep(1000);

    console.log('\n👤 Creating Fan2 wallet...');
    const fan2 = await createFundedWallet(client);
    await sleep(1000);

    // ── STEP 2: Issue Simulated RLUSD ──────────────────────────────
    console.log('\n' + DIVIDER);
    console.log('  STEP 2: Setting Up Simulated RLUSD Stablecoin');
    console.log(DIVIDER);

    // The organizer acts as the RLUSD issuer on testnet
    // In production, this would be the real RLUSD issuer (rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De)
    const rlusdIssuer = organizer;

    console.log('\n📝 Establishing trust lines for RLUSD...');
    await establishTrustLine(client, fan1, rlusdIssuer.address);
    await sleep(500);
    await establishTrustLine(client, fan2, rlusdIssuer.address);
    await sleep(500);

    console.log('\n💵 Distributing RLUSD to fans...');
    await fundRLUSD(client, rlusdIssuer, fan1, '1000');
    await sleep(500);
    await fundRLUSD(client, rlusdIssuer, fan2, '1000');
    await sleep(500);

    const fan1Balance = await getRLUSDBalance(client, fan1.address, rlusdIssuer.address);
    const fan2Balance = await getRLUSDBalance(client, fan2.address, rlusdIssuer.address);
    console.log(`\n  Fan1 RLUSD balance: ${fan1Balance}`);
    console.log(`  Fan2 RLUSD balance: ${fan2Balance}`);

    // ── STEP 3: Mint Tickets ───────────────────────────────────────
    console.log('\n' + DIVIDER);
    console.log('  STEP 3: Organizer Mints NFT Tickets');
    console.log(DIVIDER);

    const ticket1Metadata = {
      eventId: 'EVT-2026-001',
      eventName: 'Blockchain Music Festival 2026',
      seat: 'VIP-A101',
      originalPrice: '150',
      maxResalePrice: '200',
      eventDate: '2026-12-31T20:00:00Z',
      maxResales: 3,
    };

    console.log('\n🎫 Minting Ticket 1...');
    const ticket1 = await mintTicket(client, organizer, ticket1Metadata);
    await sleep(1000);

    const ticket2Metadata = {
      eventId: 'EVT-2026-001',
      eventName: 'Blockchain Music Festival 2026',
      seat: 'GA-B205',
      originalPrice: '75',
      maxResalePrice: '100',
      eventDate: '2026-12-31T20:00:00Z',
      maxResales: 2,
    };

    console.log('\n🎫 Minting Ticket 2...');
    const ticket2 = await mintTicket(client, organizer, ticket2Metadata);
    await sleep(1000);

    // ── STEP 4: Fan1 Buys Ticket (Primary Sale) ────────────────────
    console.log('\n' + DIVIDER);
    console.log('  STEP 4: Fan1 Buys Ticket 1 (Primary Sale)');
    console.log(DIVIDER);

    console.log(`\n🛒 Fan1 purchasing ticket for ${ticket1Metadata.originalPrice} RLUSD...`);
    const purchase = await buyTicket(
      client, fan1, organizer, ticket1.tokenId,
      ticket1Metadata.originalPrice, rlusdIssuer.address
    );
    console.log(`  🔗 TX: ${config.EXPLORER_URL}/transactions/${purchase.txHash}`);
    await sleep(1000);

    // ── STEP 5: Attempted Scalping (BLOCKED) ───────────────────────
    console.log('\n' + DIVIDER);
    console.log('  STEP 5: Fan1 Attempts to Scalp (Resell Above Max Price)');
    console.log(DIVIDER);

    console.log('\n🚫 Fan1 tries to resell at 500 RLUSD (max is 200)...');
    try {
      await resellTicket(
        client, fan1, fan2, ticket1.tokenId,
        '500', rlusdIssuer.address, ticket1.metadata
      );
      console.log('  ❌ ERROR: This should have been blocked!');
    } catch (err) {
      console.log(`  ${err.message}`);
      console.log('  ✅ Scalping attempt successfully BLOCKED!\n');
    }

    // ── STEP 6: Valid Resale (With Royalty) ─────────────────────────
    console.log(DIVIDER);
    console.log('  STEP 6: Fan1 Resells to Fan2 at Valid Price');
    console.log(DIVIDER);

    console.log(`\n🔄 Fan1 reselling ticket to Fan2 for 180 RLUSD (max: 200)...`);
    const resale = await resellTicket(
      client, fan1, fan2, ticket1.tokenId,
      '180', rlusdIssuer.address, ticket1.metadata
    );
    console.log(`  🔗 TX: ${config.EXPLORER_URL}/transactions/${resale.txHash}`);
    await sleep(1000);

    // Show updated balances
    const fan1BalanceAfter = await getRLUSDBalance(client, fan1.address, rlusdIssuer.address);
    const fan2BalanceAfter = await getRLUSDBalance(client, fan2.address, rlusdIssuer.address);
    console.log(`\n  Fan1 RLUSD balance: ${fan1BalanceAfter} (received payment minus royalty)`);
    console.log(`  Fan2 RLUSD balance: ${fan2BalanceAfter} (paid 180 RLUSD)`);

    // ── STEP 7: Verify Ticket Ownership ────────────────────────────
    console.log('\n' + DIVIDER);
    console.log('  STEP 7: Verify Ticket Ownership');
    console.log(DIVIDER);

    console.log('\n🔍 Checking if Fan1 still owns ticket...');
    await verifyTicket(client, fan1.address, ticket1.tokenId);

    console.log('\n🔍 Checking if Fan2 now owns ticket...');
    await verifyTicket(client, fan2.address, ticket1.tokenId);

    // ── Summary ────────────────────────────────────────────────────
    console.log('\n' + DIVIDER);
    console.log('  ✅ DEMO COMPLETE — All Steps Passed!');
    console.log(DIVIDER);
    console.log('\n  Summary:');
    console.log(`    Organizer: ${organizer.address}`);
    console.log(`    Fan1:      ${fan1.address}`);
    console.log(`    Fan2:      ${fan2.address}`);
    console.log(`    Ticket 1:  ${ticket1.tokenId}`);
    console.log(`    Ticket 2:  ${ticket2.tokenId}`);
    console.log(`\n  Explore on XRPL Testnet: ${config.EXPLORER_URL}\n`);

  } catch (err) {
    console.error('\n❌ Demo failed:', err.message);
    console.error(err);
  } finally {
    await client.disconnect();
    console.log('📡 Disconnected from XRPL Testnet.\n');
  }
}

main();

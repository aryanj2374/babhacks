const xrpl = require('xrpl');
const { mintTicket } = require('./src/ticket');

async function test() {
  const client = new xrpl.Client('wss://s.altnet.rippletest.net:51233');
  await client.connect();
  console.log('connected');
  const { wallet } = await client.fundWallet();
  console.log('wallet:', wallet.address);

  const metadata = {
    eventId: 'test-1', eventName: 'Test Concert', seat: 'A-101',
    originalPrice: '100', maxResalePrice: '150',
    eventDate: '2027-06-01T00:00:00Z', maxResales: 3,
  };

  console.log('calling mintTicket...');
  const start = Date.now();
  const result = await mintTicket(client, wallet, metadata);
  console.log('done in', Date.now() - start, 'ms');
  console.log('tokenId:', result.tokenId);
  console.log('txHash:', result.txHash);

  await client.disconnect();
  process.exit(0);
}

test().catch(function(e) { console.error('FAILED:', e.message); process.exit(1); });

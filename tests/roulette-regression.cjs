const assert = require('node:assert/strict');
const engine = require('../src/services/roulette-engine');
const makeService = require('../src/services/roulette');

console.log('Running Roulette regression tests...');

// 1. Test engine configuration & draw determinism
assert.equal(engine.WHEEL_ORDER.length, 15, 'Wheel must contain 15 slots');
assert.equal(engine.SLOTS_CONFIG[0].color, 'dragon', 'Slot 0 is Dragon');
assert.equal(engine.SLOTS_CONFIG[0].multiplier, 13.5, 'Dragon multiplier is 13.5');
assert.equal(engine.SLOTS_CONFIG[1].color, 't', 'Slot 1 is T');
assert.equal(engine.SLOTS_CONFIG[1].multiplier, 1.95, 'T multiplier is 1.95');
assert.equal(engine.SLOTS_CONFIG[8].color, 'ct', 'Slot 8 is CT');
assert.equal(engine.SLOTS_CONFIG[8].multiplier, 1.95, 'CT multiplier is 1.95');

const serverSeed = 'abc123fixedserverseed';
const clientSeed = 'testclientseed';
const draw1 = engine.draw(serverSeed, clientSeed, 1);
const draw2 = engine.draw(serverSeed, clientSeed, 1);
assert.equal(draw1.slot, draw2.slot, 'Draw must be deterministic for identical seeds and nonce');
assert.ok(draw1.slot >= 0 && draw1.slot <= 14, 'Slot must be between 0 and 14');
assert.ok(draw1.offset >= 0.15 && draw1.offset <= 0.85, 'Offset must be in range [0.15, 0.85]');

// 2. Test commitment
const hash = engine.commitment(serverSeed);
assert.equal(typeof hash, 'string');
assert.equal(hash.length, 64, 'SHA-256 hash must be 64 characters');

// 3. Test validation
assert.throws(() => engine.validateBet({ choice: 'invalid', amount: 10 }), /Vui lòng chọn cửa cược/);
assert.throws(() => engine.validateBet({ choice: 't', amount: 0 }), /Mức cược phải từ 1 đến 1.000/);
assert.throws(() => engine.validateBet({ choice: 't', amount: 1500 }), /Mức cược phải từ 1 đến 1.000/);
const valid = engine.validateBet({ choice: 'dragon', amount: 50 });
assert.equal(valid.choice, 'dragon');
assert.equal(valid.amount, 50);

// 4. Test payouts with 5% tax
assert.equal(engine.payout(100, 't', 't', 1.95), 195, 'T win pays 195 on 100 bet');
assert.equal(engine.payout(100, 'ct', 't', 1.95), 0, 'CT loss pays 0');
assert.equal(engine.payout(100, 'dragon', 'dragon', 13.5), 1350, 'Dragon win pays 1350 on 100 bet');

// 5. Test service with simulated bank
let playerWallet = 1000;
const mockBank = {
  balance: async (sid) => playerWallet,
  change: async (sid, amount, reason) => {
    playerWallet += amount;
    return { ok: true, applied: true, balance: playerWallet };
  }
};

const service = makeService(mockBank);

(async () => {
  const testSid = '76561198000000001';

  // State check
  const state = await service.state(testSid);
  assert.equal(state.authenticated, true);
  assert.equal(state.balance, 1000);
  assert.equal(state.minBet, 1);
  assert.equal(state.maxBet, 1000);

  // Insufficient balance check (wallet has 500, bet is 800)
  playerWallet = 500;
  await assert.rejects(
    () => service.spin(testSid, { choice: 't', amount: 800 }),
    /Bạn không đủ Lúa/
  );

  // Play a spin with 50 Lúa
  const spinRes = await service.spin(testSid, { choice: 't', amount: 50, clientSeed: 'regtest' });
  assert.ok(spinRes.outcome, 'Outcome must be returned');
  assert.ok(spinRes.game.serverSeed, 'Server seed must be revealed after settlement');
  assert.equal(typeof spinRes.balance, 'number');

  console.log('PASS Roulette regression: engine math, provably fair seed, validation, wallet debit/credit, and state.');
})().catch(err => {
  console.error('Roulette regression failed:', err);
  process.exit(1);
});

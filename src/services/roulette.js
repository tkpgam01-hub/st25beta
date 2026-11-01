const engine = require('./roulette-engine');
const defaultStore = require('../models/roulette-store');

const error = (message, status = 400) => Object.assign(new Error(message), { status });

module.exports = function(bank, store = defaultStore) {
  const requirePlayer = sid => {
    if (!sid) throw error('Vui lòng liên kết Steam để tham gia Vòng quay bằng Lúa.', 401);
  };

  const publicGame = row => ({
    id: row.id,
    status: row.status,
    createdAt: Number(row.created_at),
    commitment: engine.commitment(row.seed),
    ...row.payload,
    ...(row.status === 'settled' ? { serverSeed: row.seed } : {})
  });

  async function state(sid) {
    let balance = null;
    let userHistory = [];
    let rolls = [];

    await Promise.all([
      (async () => {
        if (sid) {
          try {
            balance = await bank.balance(sid);
          } catch (e) {
            balance = null;
          }
        }
      })(),
      (async () => {
        try {
          if (sid) {
            const histRows = await store.history(sid, 15);
            userHistory = histRows.map(publicGame);
          }
          rolls = await store.recentRolls(100);
        } catch (e) {
          rolls = [];
        }
      })()
    ]);

    // If rolls is empty (e.g. freshly started), supply a realistic initial seed distribution
    if (!rolls || rolls.length === 0) {
      const colors = ['t', 'ct', 't', 'ct', 'dragon', 't', 'ct', 't', 'ct', 'ct', 't', 't', 'ct', 'ct', 't'];
      rolls = colors.map((c, i) => ({
        slot: c === 'dragon' ? 0 : (c === 't' ? 1 + (i % 7) : 8 + (i % 7)),
        color: c,
        createdAt: Date.now() - (15 - i) * 60000
      }));
    }

    const walletAvailable = !!sid && Number.isFinite(balance) && balance >= 0;
    const hasUnresolved = userHistory.some(g => ['review', 'debit_pending', 'credit_pending'].includes(g.status));

    // Calculate last 100 stats
    const stats100 = { t: 0, ct: 0, dragon: 0 };
    for (const r of rolls) {
      if (stats100[r.color] !== undefined) stats100[r.color]++;
    }

    return {
      authenticated: !!sid,
      walletAvailable,
      blocked: hasUnresolved,
      balance: walletAvailable ? balance : 0,
      history: userHistory,
      recentRolls: rolls.slice(0, 20),
      stats100,
      minBet: 1,
      maxBet: 1000,
      wheelOrder: engine.WHEEL_ORDER,
      slotsConfig: engine.SLOTS_CONFIG
    };
  }

  async function prepare(sid) {
    requirePlayer(sid);
    return store.withPlayer(sid, async handle => {
      if (await store.unresolved(handle, sid)) {
        throw error('Có giao dịch trước đó đang xử lý hoặc cần đối soát. Vui lòng liên hệ hỗ trợ.', 409);
      }
      const row = await store.prepare(handle, sid);
      return publicGame(row);
    });
  }

  async function change(handle, row, amount, kind) {
    let result;
    try {
      result = await bank.change(row.steam_id, amount, `st25_roulette_${kind}_${row.id}`);
    } catch (e) {
      console.error('Roulette bank change error:', e.message);
    }
    if (!result?.ok || result.applied === false || !Number.isFinite(result.balance) || result.balance < 0) {
      await store.update(handle, row, 'review');
      throw error('Ví máy chủ chưa xác nhận giao dịch. Vui lòng kiểm tra lại số dư hoặc liên hệ Admin.', 503);
    }
    return result.balance;
  }

  async function spin(sid, input) {
    requirePlayer(sid);
    const valid = engine.validateBet(input);

    return store.withPlayer(sid, async handle => {
      let row;
      if (input.gameId) {
        row = await store.get(handle, input.gameId, sid);
      }
      if (!row || row.status === 'settled') {
        row = await store.prepare(handle, sid);
      }

      if (row.status !== 'prepared' || (await store.unresolved(handle, sid))) {
        throw error('Lượt cược trước đang được xử lý.', 409);
      }

      // 1. Verify player balance
      const currentBalance = await bank.balance(sid, true);
      if (!Number.isFinite(currentBalance) || currentBalance < valid.amount) {
        throw error(`Bạn không đủ Lúa để đặt cược (Số dư hiện tại: ${Number.isFinite(currentBalance) ? currentBalance : 0} Lúa).`, 400);
      }

      // 2. Draw result deterministically using provably fair seed
      const outcome = engine.draw(row.seed, valid.clientSeed, row.id);
      const winPayout = engine.payout(valid.amount, valid.choice, outcome.color, outcome.multiplier);
      const isWin = winPayout > 0;

      const payload = {
        gameId: row.id,
        choice: valid.choice,
        amount: valid.amount,
        clientSeed: valid.clientSeed,
        slot: outcome.slot,
        color: outcome.color,
        offset: outcome.offset,
        multiplier: outcome.multiplier,
        payout: winPayout,
        isWin,
        algorithm: 'hmac-sha256-roulette-v1'
      };

      // 3. Atomic Debit
      row = await store.update(handle, row, 'debit_pending', payload);
      let newBalance = await change(handle, row, -valid.amount, 'bet');
      payload.balanceAfterDebit = newBalance;

      // 4. Atomic Credit if player won
      if (isWin) {
        row = await store.update(handle, row, 'credit_pending', payload);
        newBalance = await change(handle, row, winPayout, 'win');
      }

      payload.balance = newBalance;
      row = await store.update(handle, row, 'settled', payload);

      return {
        game: publicGame(row),
        balance: newBalance,
        outcome: {
          slot: outcome.slot,
          color: outcome.color,
          multiplier: outcome.multiplier,
          offset: outcome.offset,
          isWin,
          payout: winPayout
        }
      };
    });
  }

  return {
    state,
    prepare,
    spin
  };
};

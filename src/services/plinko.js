const engine = require('./plinko-engine');
const defaultStore = require('../models/plinko-store');
const error = (message, status = 400) => Object.assign(new Error(message), { status });

module.exports = function(bank, store = defaultStore) {
  const ready = sid => {
    if (process.env.PLINKO_ENABLED === 'false') {
      if (process.env.PLINKO_TEST_STEAM_IDS) {
        return !!sid && process.env.PLINKO_TEST_STEAM_IDS.split(',').map(id => id.trim()).filter(id => /^\d{17}$/.test(id)).includes(String(sid));
      }
      return false;
    }
    return true;
  };

  const requirePlayer = sid => {
    if (!sid) throw error('Liên kết Steam để chơi bằng Lúa.', 401);
  };

  const publicGame = row => ({
    id: row.id,
    status: row.status,
    createdAt: Number(row.created_at),
    commitment: engine.commitment(row.seed),
    ...(typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload),
    ...(row.status === 'settled' ? { serverSeed: row.seed } : {})
  });

  async function state(sid) {
    let balance = null, history = [], available = ready(sid), databaseFailed = false;
    await Promise.all([
      (async () => {
        if (sid) {
          try {
            balance = await bank.balance(sid);
          } catch {}
        }
      })(),
      (async () => {
        try {
          if (store.database) await store.database();
          if (sid) history = (await store.history(sid)).map(publicGame);
        } catch (e) {
          databaseFailed = true;
          available = false;
        }
      })()
    ]);

    const walletAvailable = !!sid && Number.isFinite(balance) && balance >= 0;
    // Chỉ khóa tạm thời nếu có giao dịch đang chờ xử lý trong 30 giây gần nhất
    const blocked = history.some(game => ['review', 'debit_pending', 'credit_pending'].includes(game.status) && (Date.now() - Number(game.createdAt) < 30000));
    const message = databaseFailed
      ? 'Không kết nối được kho giao dịch. Chơi bằng Lúa tạm dừng; vui lòng thử lại sau.'
      : !available
        ? 'Plinko đang tạm đóng. Vui lòng thử lại sau.'
        : blocked
          ? 'Giao dịch đang xử lý. Vui lòng chờ vài giây rồi tiếp tục.'
          : sid && !walletAvailable
            ? 'Không đọc được ví Lúa máy chủ. Thử lại khi kết nối phục hồi.'
            : 'Lúa miễn phí trong game · Đặt trừ Lúa, nhận thưởng cộng vào ví máy chủ.';

    return {
      ready: available,
      authenticated: !!sid,
      walletAvailable,
      blocked,
      balance,
      history,
      minBet: 1,
      maxBet: 500,
      maxRows: 16,
      minRows: 8,
      tables: Array.from({ length: 9 }, (_, i) => engine.risks.map(risk => engine.table(i + 8, risk))).flat(),
      message
    };
  }

  async function prepare(sid) {
    requirePlayer(sid);
    if (!ready(sid)) throw error('Plinko chưa được bật.', 503);
    return store.withPlayer(sid, async client => {
      if (await store.unresolved(client, sid)) throw error('Có giao dịch cần đối soát. Liên hệ hỗ trợ.', 409);
      return publicGame(await store.prepare(client, sid));
    });
  }

  async function change(client, row, amount, kind) {
    let result;
    try {
      result = await bank.change(row.steam_id, amount, `st25_plinko_${kind}_${row.id}`);
    } catch {}
    if (!result?.ok || result.applied === false || !Number.isFinite(result.balance) || result.balance < 0) {
      await store.update(client, row, 'review');
      throw error('Ví chưa xác nhận giao dịch. Kiểm tra lịch sử và liên hệ hỗ trợ; không gửi lại.', 503);
    }
    return result.balance;
  }

  async function play(sid, input) {
    requirePlayer(sid);
    engine.validate(input);
    return store.withPlayer(sid, async client => {
      let row = await store.get(client, input.gameId, sid);
      if (!row) throw error('Lượt chơi không tồn tại.', 404);
      if (row.status === 'settled') return { game: publicGame(row), replayed: true };
      if (!ready(sid)) throw error('Plinko đang tạm đóng.', 503);
      if (row.status !== 'prepared' || await store.unresolved(client, sid)) throw error('Giao dịch đang xử lý hoặc cần đối soát.', 409);

      const balance = await bank.balance(sid, true);
      if (!Number.isFinite(balance) || balance < input.amount) throw error('Không đủ Lúa trong ví game.', 400);

      const config = engine.table(input.rows, input.risk);
      const result = engine.draw(row.seed, input.clientSeed, input.rows);
      const payload = {
        gameId: row.id,
        amount: input.amount,
        rows: input.rows,
        risk: input.risk,
        clientSeed: input.clientSeed,
        ...result,
        multiplier: config.multipliers[result.slot],
        payout: engine.payout(input.amount, config.multipliers[result.slot]),
        algorithm: 'hmac-sha256-row-v1',
        tableVersion: 1
      };

      row = await store.update(client, row, 'debit_pending', payload);
      payload.balance = await change(client, row, -input.amount, 'debit');

      if (payload.payout > 0) {
        row = await store.update(client, row, 'credit_pending', payload);
        payload.balance = await change(client, row, payload.payout, 'payout');
      }

      row = await store.update(client, row, 'settled', payload);
      return { game: publicGame(row), balance: payload.balance };
    });
  }

  return { state, prepare, play };
};

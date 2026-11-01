const crypto = require('node:crypto');

// CS2/CSGO Roulette Standard Wheel Definition (15 slots: 0 to 14)
// Tỷ lệ cược đã áp dụng thuế sàn 5% (House Edge & Server Tax ~9%):
// Slot 0: Dragon (Special / Center) - 13.5X (Chuẩn 14X trừ 5% thuế bảo trì)
// Slots 1-7: T (Carnivore / Red) - 1.95X (Chuẩn 2X trừ 5% thuế bảo trì)
// Slots 8-14: CT (Herbivore / Blue) - 1.95X (Chuẩn 2X trừ 5% thuế bảo trì)
const WHEEL_ORDER = [0, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 13, 7, 14];

const TAX_RATE = 0.05; // 5% thuế sàn bảo trì server

const SLOTS_CONFIG = {
  0: { slot: 0, color: 'dragon', label: 'Dragon', multiplier: 13.5, theme: 'gold' },
  1: { slot: 1, color: 't', label: '1', multiplier: 1.95, theme: 'red' },
  2: { slot: 2, color: 't', label: '2', multiplier: 1.95, theme: 'red' },
  3: { slot: 3, color: 't', label: '3', multiplier: 1.95, theme: 'red' },
  4: { slot: 4, color: 't', label: '4', multiplier: 1.95, theme: 'red' },
  5: { slot: 5, color: 't', label: '5', multiplier: 1.95, theme: 'red' },
  6: { slot: 6, color: 't', label: '6', multiplier: 1.95, theme: 'red' },
  7: { slot: 7, color: 't', label: '7', multiplier: 1.95, theme: 'red' },
  8: { slot: 8, color: 'ct', label: '8', multiplier: 1.95, theme: 'blue' },
  9: { slot: 9, color: 'ct', label: '9', multiplier: 1.95, theme: 'blue' },
  10: { slot: 10, color: 'ct', label: '10', multiplier: 1.95, theme: 'blue' },
  11: { slot: 11, color: 'ct', label: '11', multiplier: 1.95, theme: 'blue' },
  12: { slot: 12, color: 'ct', label: '12', multiplier: 1.95, theme: 'blue' },
  13: { slot: 13, color: 'ct', label: '13', multiplier: 1.95, theme: 'blue' },
  14: { slot: 14, color: 'ct', label: '14', multiplier: 1.95, theme: 'blue' }
};

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

function commitment(serverSeed) {
  return crypto.createHash('sha256').update(serverSeed).digest('hex');
}

/**
 * Deterministically draws a winning slot from serverSeed and clientSeed using HMAC-SHA256
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {string|number} nonce
 * @returns {{ slot: number, color: string, multiplier: number, offset: number, hash: string }}
 */
function draw(serverSeed, clientSeed, nonce = 1) {
  const hmac = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest('hex');
  // Take first 8 hex characters (32 bits) and modulo 15
  const intVal = parseInt(hmac.substring(0, 8), 16);
  const slot = intVal % 15;
  // Offset within slot: 0.15 to 0.85 to avoid landing exactly on edge
  const offsetRaw = parseInt(hmac.substring(8, 12), 16) / 0xffff;
  const offset = 0.15 + (offsetRaw * 0.70);
  const info = SLOTS_CONFIG[slot];
  return {
    slot,
    color: info.color,
    multiplier: info.multiplier,
    offset,
    hash: hmac
  };
}

function validateBet(input) {
  if (!input) fail('Dữ liệu đặt cược không hợp lệ.');
  const { choice, amount, clientSeed } = input;
  const validChoices = ['t', 'ct', 'dragon'];
  if (!validChoices.includes(choice)) fail('Vui lòng chọn cửa cược: T (Đỏ), CT (Xanh), hoặc Dragon (Vàng).');
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000) fail('Mức cược phải từ 1 đến 1.000 Lúa nguyên.');
  if (clientSeed && (typeof clientSeed !== 'string' || clientSeed.length > 128)) fail('Client seed không hợp lệ.');
  return { choice, amount, clientSeed: clientSeed || 'st25-vietnam-player' };
}

function payout(amount, choice, winningColor, multiplier) {
  if (choice === winningColor) {
    return Math.floor(amount * multiplier);
  }
  return 0;
}

module.exports = {
  WHEEL_ORDER,
  SLOTS_CONFIG,
  TAX_RATE,
  commitment,
  draw,
  validateBet,
  payout
};

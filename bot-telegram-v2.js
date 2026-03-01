// ── SISTEMA DE BONOS ──────────────────────────────────────────────────────
const BONOS = [
  { refs: 5,  ventas_min: 100,  bono_usdt: 5,   bono_pisk: 50,   nivel: '🥉 BRONCE'  },
  { refs: 10, ventas_min: 250,  bono_usdt: 15,  bono_pisk: 150,  nivel: '🥈 PLATA'   },
  { refs: 25, ventas_min: 600,  bono_usdt: 50,  bono_pisk: 500,  nivel: '🥇 ORO'     },
  { refs: 50, ventas_min: 1000, bono_usdt: 100, bono_pisk: 1000, nivel: '💎 DIAMANTE' }
];

function calcularBono(user) {
  const refs_inv = (user.mis_referidos||[]).filter(id => db.usuarios[id]?.compras_usdt > 0);
  const volumen  = refs_inv.reduce((s,id) => s+(db.usuarios[id]?.compras_usdt||0), 0);
  const total    = (user.mis_referidos||[]).length;
  let alcanzado = null;
  let proximo   = null;
  for (const b of BONOS) {
    if (total >= b.refs && volumen >= b.ventas_min) alcanzado = b;
    else if (!proximo) proximo = b;
  }
  return { alcanzado, proximo, refs_inv: refs_inv.length, volumen, total };
}

function textoBonos(user) {
  const { alcanzado, proximo, refs_inv, volumen, total } = calcularBono(user);
  let txt = `🏆 *SISTEMA DE BONOS NEO PISK*\n\n`;
  txt += `📊 *Tu progreso:*\n`;
  txt += `👥 Referidos totales: *${total}*\n`;
  txt += `💰 Referidos inversores: *${refs_inv}*\n`;
  txt += `💵 Volumen grupal: *$${volumen.toFixed(2)} USDT*\n\n`;
  txt += `━━━━━━━━━━━━━━━━━━━━\n`;
  txt += `💎 *TABLA DE BONOS*\n`;
  txt += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  for (const b of BONOS) {
    const ok = total >= b.refs && volumen >= b.ventas_min;
    txt += `${ok?'✅':'🔒'} *${b.nivel}*\n`;
    txt += `   👥 ${b.refs} referidos ${total>=b.refs?'✅':'(tienes '+total+')'}\n`;
    txt += `   💵 $${b.ventas_min} en ventas ${volumen>=b.ventas_min?'✅':'(llevas $'+volumen.toFixed(0)+')'}\n`;
    txt += `   🎁 *$${b.bono_usdt} USDT + ${b.bono_pisk} $PISK*\n\n`;
  }
  txt += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (proximo) {
    const rf = Math.max(0, proximo.refs-total);
    const vf = Math.max(0, proximo.ventas_min-volumen);
    const pr = Math.min(100, Math.round(total/proximo.refs*100));
    const pv = Math.min(100, Math.round(volumen/proximo.ventas_min*100));
    const br = '█'.repeat(Math.floor(pr/10))+'░'.repeat(10-Math.floor(pr/10));
    const bv = '█'.repeat(Math.floor(pv/10))+'░'.repeat(10-Math.floor(pv/10));
    txt += `🎯 *PRÓXIMO: ${proximo.nivel}*\n\n`;
    txt += `👥 ${br} ${pr}% — faltan *${rf}* personas\n`;
    txt += `💵 ${bv} ${pv}% — faltan *$${vf.toFixed(0)} USDT*\n\n`;
    txt += `🏆 Premio: *$${proximo.bono_usdt} USDT + ${proximo.bono_pisk} $PISK*\n\n`;
  } else {
    txt += `🎉 *¡Eres promotor DIAMANTE!* 💎\n\n`;
  }
  txt += `━━━━━━━━━━━━━━━━━━━━\n`;
  txt += `📌 *Reglas:*\n`;
  txt += `• Solo referidos *humanos verificados*\n`;
  txt += `• Volumen = suma de *compras de tu grupo*\n`;
  txt += `• Bono se paga al cumplir *ambas metas*\n`;
  txt += `• Pago: *50% USDT + 50% $PISK* a tu wallet\n`;
  txt += `• Fraude = pérdida de todas las comisiones`;
  return txt;
}

/**
 * Neo Pisk Airdrop Bot v2
 * - Sistema de referidos completo
 * - Detección de compras en blockchain
 * - Notificación al admin con comisiones
 * - Mini App con MetaMask integrado
 */

const TelegramBot = require('node-telegram-bot-api');
const express    = require('express');
const https      = require('https');
const http       = require('http');

const BOT_TOKEN  = '8767981654:AAGpRz-RuG212wIqO1QARX4cboYJqwvdJQE';
const ADMIN_ID   = 332212995; // Tu ID de Telegram (cambia si es diferente)
const MINI_APP   = 'https://neopisk.lat/app.html';
const CONTRACT   = '0x07Fc7AC9D681Cdd3D100c68f6f5646970CC7fF60';
const OWNER_WALLET = '0x4739888625C8397101d9b3aeDe4633600FB91F47';
const PISK_TOKEN = '0x9d5B2A73d16dAF61712BA8527d94F6997a0E6323';
const TOKENS_PER_USDT = 10; // precio actual
const POLYGON_API = 'https://api.polygonscan.com/api';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();
app.use(express.json());

// ── BASE DE DATOS EN MEMORIA (+ persistencia en JSON) ─────────────────────
const fs = require('fs');
const DB_FILE = '/root/neopisk-airdrop/referidos-db.json';

let db = { usuarios: {}, compras: [], lastTxCheck: 0 };

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch(e) { console.log('DB nueva'); }
}

function saveDB() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch(e) {}
}

loadDB();

// ── HELPERS ───────────────────────────────────────────────────────────────
function generarCodigo(userId) {
  return 'PISK' + String(userId).slice(-6).padStart(6, '0');
}

function getUser(userId, nombre) {
  if (!db.usuarios[userId]) {
    db.usuarios[userId] = {
      id: userId,
      nombre: nombre || 'Usuario',
      codigo_ref: generarCodigo(userId),
      referido_por: null,
      wallet: null,
      compras_usdt: 0,
      pisk_recibido: 0,
      comisiones_usdt: 0,
      comisiones_pisk: 0,
      mis_referidos: [],
      fecha_registro: new Date().toISOString()
    };
    saveDB();
  }
  return db.usuarios[userId];
}

function findUserByCodigo(codigo) {
  return Object.values(db.usuarios).find(u => u.codigo_ref === codigo);
}

function findUserByWallet(wallet) {
  return Object.values(db.usuarios).find(u =>
    u.wallet && u.wallet.toLowerCase() === wallet.toLowerCase()
  );
}

// ── /start CON CÓDIGO DE REFERIDO ─────────────────────────────────────────
bot.onText(/\/start(.*)/, (msg, match) => {
  const userId = msg.from.id;
  const nombre = msg.from.first_name || 'Amigo';
  const param  = match[1].trim();

  const user = getUser(userId, nombre);
  user.nombre = nombre;

  // Registrar referido si vino con código y no tiene uno aún
  if (param && !user.referido_por) {
    const referidor = findUserByCodigo(param);
    if (referidor && referidor.id !== userId) {
      user.referido_por = referidor.codigo_ref;
      if (!referidor.mis_referidos.includes(userId)) {
        referidor.mis_referidos.push(userId);
        saveDB();
        // Notificar al referidor
        bot.sendMessage(referidor.id,
          `🎉 *¡Nuevo referido!*\n\n` +
          `👤 *${nombre}* se unió con tu código\n` +
          `🔑 Tu código: \`${referidor.codigo_ref}\`\n` +
          `👥 Total referidos: ${referidor.mis_referidos.length}\n\n` +
          `_Cuando ${nombre} compre $PISK, recibirás tu comisión_`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
    }
  }
  saveDB();

  const msg_text =
    `🚀 *¡Bienvenido al Airdrop Global $PISK, ${nombre}!*\n\n` +
    `💎 *¿Qué es $PISK?*\n` +
    `Token respaldado por flota eléctrica y robótica en Perú\n` +
    `💵 Precio de preventa: *$0.10 USD*\n\n` +
    `🎮 Gana tokens completando misiones y jugando\n` +
    `🤝 Invita amigos y gana *10%* de sus compras en USDT\n\n` +
    `🔑 Tu código: \`${user.codigo_ref}\`\n` +
    `📲 Comparte: \`t.me/NeopiskAirdropBot?start=${user.codigo_ref}\``;

  bot.sendMessage(userId, msg_text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 ABRIR AIRDROP APP', web_app: { url: `${MINI_APP}?ref=${user.codigo_ref}&uid=${userId}` } }],
        [
          { text: '💰 COMPRAR $PISK', callback_data: 'comprar' },
          { text: '👥 MIS REFERIDOS', callback_data: 'mis_referidos' }
        ],
        [{ text: '🏆 MIS BONOS Y PROGRESO', callback_data: 'bonos' }],
        [
          { text: '💼 MI WALLET', callback_data: 'mi_wallet' },
          { text: '📊 MI BALANCE', callback_data: 'balance' }
        ],
        [{ text: '📤 COMPARTIR MI LINK', callback_data: 'compartir' }]
      ]
    }
  });
});

// ── CALLBACKS ─────────────────────────────────────────────────────────────
bot.on('callback_query', async (q) => {
  const userId = q.from.id;
  const nombre = q.from.first_name || 'Amigo';
  const user   = getUser(userId, nombre);
  const data   = q.data;

  bot.answerCallbackQuery(q.id);

  // COMPRAR
  if (data === 'comprar') {
    const buyUrl = `https://neopisk.lat/comprar.html?ref=${user.codigo_ref}&uid=${userId}`;
    bot.sendMessage(userId,
      `💰 *COMPRAR $PISK*\n\n` +
      `📋 Contrato: \`${CONTRACT}\`\n` +
      `🔗 Red: *Polygon (MATIC)*\n` +
      `💵 Precio: *$0.10 USD = 1 $PISK*\n` +
      `📦 Recibirás: *10 $PISK por cada $1 USDT*\n\n` +
      `_Necesitas USDT en red Polygon_\n\n` +
      `⚠️ *IMPORTANTE:* Cuando hagas la compra envíame tu hash de transacción para registrar tu comisión`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🦊 ABRIR METAMASK / COMPRAR', web_app: { url: `https://neopisk.lat/comprar.html?uid=${userId}&ref=${user.codigo_ref}` } }],
            [{ text: '📋 COPIAR CONTRATO', callback_data: 'copiar_contrato' }],
            [{ text: '◀ VOLVER', callback_data: 'menu' }]
          ]
        }
      }
    );
  }

  // COPIAR CONTRATO
  if (data === 'copiar_contrato') {
    bot.sendMessage(userId, `\`${CONTRACT}\``, { parse_mode: 'Markdown' });
  }

  // MIS REFERIDOS
  if (data === 'mis_referidos') {
    const refs = user.mis_referidos.map(id => db.usuarios[id]).filter(Boolean);
    let txt = `👥 *MIS REFERIDOS* (${refs.length})\n\n`;
    if (refs.length === 0) {
      txt += `_Aún no tienes referidos_\n\nComparte tu link:\n\`t.me/NeopiskAirdropBot?start=${user.codigo_ref}\``;
    } else {
      refs.forEach((r, i) => {
        txt += `${i+1}. 👤 *${r.nombre}*\n`;
        txt += `   💵 Compras: $${r.compras_usdt.toFixed(2)} USDT\n`;
        txt += `   🪙 ${r.pisk_recibido} $PISK recibidos\n\n`;
      });
      txt += `\n💰 *Tus comisiones ganadas:*\n`;
      txt += `   USDT: $${user.comisiones_usdt.toFixed(2)}\n`;
      txt += `   $PISK: ${user.comisiones_pisk}`;
    }
    bot.sendMessage(userId, txt, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: '📤 COMPARTIR LINK', callback_data: 'compartir' }],
        [{ text: '◀ VOLVER', callback_data: 'menu' }]
      ]}
    });
  }

  // COMPARTIR
  if (data === 'compartir') {
    const link = `https://t.me/NeopiskAirdropBot?start=${user.codigo_ref}`;
    const msg_share =
      `🚀 ¡Únete al Airdrop Global $PISK y gana tokens reales!\n\n` +
      `💎 Token respaldado por flota eléctrica y robótica en Perú\n` +
      `💵 Precio preventa: $0.10 USD\n\n` +
      `🎮 Gana $PISK jugando mini juegos\n` +
      `🤝 Comisiones por referidos: 10% + 3% + 1%\n\n` +
      `📲 Únete aquí → ${link}\n` +
      `🔑 Mi código: ${user.codigo_ref}`;

    bot.sendMessage(userId,
      `📤 *COMPARTIR MI INVITACIÓN*\n\n` +
      `Tu link personal:\n\`${link}\`\n\n` +
      `Cuando alguien use tu link y compre $PISK, recibirás automáticamente el *10% en USDT* + *5% en $PISK*\n\n` +
      `*Mensaje listo para compartir:*`,
      { parse_mode: 'Markdown' }
    );
    bot.sendMessage(userId, msg_share); // mensaje sin formato para fácil forward
  }

  // BALANCE
  if (data === 'balance') {
    bot.sendMessage(userId,
      `📊 *MI BALANCE*\n\n` +
      `💼 Wallet: ${user.wallet ? '`'+user.wallet.slice(0,10)+'...`' : '_No registrada_'}\n\n` +
      `🪙 $PISK comprados: *${user.pisk_recibido}*\n` +
      `💵 USDT invertidos: *$${user.compras_usdt.toFixed(2)}*\n\n` +
      `💰 *Comisiones ganadas:*\n` +
      `   💵 USDT: $${user.comisiones_usdt.toFixed(2)}\n` +
      `   🪙 $PISK: ${user.comisiones_pisk}\n\n` +
      `👥 Referidos: *${user.mis_referidos.length}*\n` +
      `🔑 Tu código: \`${user.codigo_ref}\``,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '◀ VOLVER', callback_data: 'menu' }]] }
      }
    );
  }

  // MI WALLET
  if (data === 'mi_wallet') {
    if (user.wallet) {
      bot.sendMessage(userId,
        `💼 *TU WALLET REGISTRADA*\n\n\`${user.wallet}\`\n\n_Las comisiones se enviarán a esta wallet_`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [
            [{ text: '🔄 CAMBIAR WALLET', callback_data: 'cambiar_wallet' }],
            [{ text: '◀ VOLVER', callback_data: 'menu' }]
          ]}
        }
      );
    } else {
      bot.sendMessage(userId,
        `💼 *REGISTRAR TU WALLET*\n\n` +
        `Para recibir tus comisiones necesitas registrar tu wallet de Polygon.\n\n` +
        `Envía tu dirección 0x... ahora:`,
        { parse_mode: 'Markdown' }
      );
      db.usuarios[userId]._esperando = 'wallet';
      saveDB();
    }
  }

  // CAMBIAR WALLET
  if (data === 'cambiar_wallet') {
    bot.sendMessage(userId, `Envía tu nueva dirección wallet (0x...):`, { parse_mode: 'Markdown' });
    db.usuarios[userId]._esperando = 'wallet';
    saveDB();
  }

  // BONOS
  if (data === 'bonos') {
    const txt = textoBonos(user);
    bot.sendMessage(userId, txt, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: '📤 COMPARTIR Y GANAR', callback_data: 'compartir' }],
        [{ text: '◀ VOLVER', callback_data: 'menu' }]
      ]}
    });
  }

  // MENU
  if (data === 'menu') {
    bot.sendMessage(userId, `Menú principal:`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 ABRIR AIRDROP APP', web_app: { url: `${MINI_APP}?ref=${user.codigo_ref}&uid=${userId}` } }],
          [
            { text: '💰 COMPRAR $PISK', callback_data: 'comprar' },
            { text: '👥 MIS REFERIDOS', callback_data: 'mis_referidos' }
          ],
          [
            { text: '💼 MI WALLET', callback_data: 'mi_wallet' },
            { text: '📊 MI BALANCE', callback_data: 'balance' }
          ],
          [{ text: '📤 COMPARTIR MI LINK', callback_data: 'compartir' }]
        ]
      }
    });
  }
});

// ── MENSAJES DE TEXTO (wallet, hash tx) ───────────────────────────────────
bot.on('message', (msg) => {
  if (msg.text && msg.text.startsWith('/')) return;
  const userId = msg.from.id;
  const nombre = msg.from.first_name || 'Amigo';
  const user   = getUser(userId, nombre);
  const text   = msg.text || '';

  // Esperando wallet
  if (user._esperando === 'wallet') {
    if (/^0x[a-fA-F0-9]{40}$/.test(text.trim())) {
      user.wallet = text.trim();
      user._esperando = null;
      saveDB();
      bot.sendMessage(userId,
        `✅ *Wallet registrada*\n\n\`${user.wallet}\`\n\nTus comisiones llegarán aquí cuando tus referidos compren $PISK 🎉`,
        { parse_mode: 'Markdown' }
      );
    } else {
      bot.sendMessage(userId, `❌ Dirección inválida. Debe empezar con 0x y tener 42 caracteres.\n\nIntenta de nuevo:`);
    }
    return;
  }

  // Hash de transacción enviado manualmente
  if (/^0x[a-fA-F0-9]{64}$/.test(text.trim())) {
    const txHash = text.trim();
    bot.sendMessage(userId, `🔍 Verificando tu transacción...\n\`${txHash}\``, { parse_mode: 'Markdown' });
    verificarTxHash(txHash, userId, nombre);
    return;
  }

  // Saludo inicial
  if (/^(hola|hello|hi|inicio|start)$/i.test(text.trim())) {
    bot.sendMessage(userId,
      `👋 ¡Hola ${nombre}! Usa /start para ver el menú del Airdrop $PISK 🚀`
    );
    return;
  }
});

// ── VERIFICAR TRANSACCIÓN EN POLYGON ──────────────────────────────────────
async function verificarTxHash(txHash, compradorId, compradorNombre) {
  try {
    const url = `${POLYGON_API}?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=YourPolygonScanAPIKey`;
    const data = await fetchJSON(url);

    if (!data.result || data.result === null) {
      bot.sendMessage(compradorId, `❌ Transacción no encontrada. Verifica el hash e intenta de nuevo.`);
      return;
    }

    const tx = data.result;
    const toAddr = tx.to?.toLowerCase();
    const fromAddr = tx.from?.toLowerCase();

    // Verificar que sea una compra en nuestro contrato
    if (toAddr !== CONTRACT.toLowerCase()) {
      bot.sendMessage(compradorId, `⚠️ Esta transacción no es hacia el contrato de Neo Pisk.\n\nContrato correcto: \`${CONTRACT}\``, { parse_mode: 'Markdown' });
      return;
    }

    // Verificar que no esté ya registrada
    if (db.compras.find(c => c.txHash === txHash)) {
      bot.sendMessage(compradorId, `⚠️ Esta transacción ya fue registrada previamente.`);
      return;
    }

    // Obtener receipt para confirmar éxito
    const receiptUrl = `${POLYGON_API}?module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}&apikey=YourPolygonScanAPIKey`;
    const receiptData = await fetchJSON(receiptUrl);
    const receipt = receiptData.result;

    if (!receipt || receipt.status !== '0x1') {
      bot.sendMessage(compradorId, `❌ La transacción falló en la blockchain. No se puede registrar.`);
      return;
    }

    // Calcular USDT transferido (del input data)
    // buyWithUSDT(uint256) → los últimos 32 bytes del input son el monto
    let usdtAmount = 0;
    if (tx.input && tx.input.length >= 10) {
      const amountHex = tx.input.slice(-64);
      const amountWei = parseInt(amountHex, 16);
      usdtAmount = amountWei / 1e6; // USDT tiene 6 decimales
    }
    const piskAmount = usdtAmount * TOKENS_PER_USDT;

    const comprador = getUser(compradorId, compradorNombre);
    comprador.compras_usdt += usdtAmount;
    comprador.pisk_recibido += piskAmount;
    if (!comprador.wallet) comprador.wallet = fromAddr;

    // Registrar la compra
    const compra = {
      txHash,
      compradorId,
      compradorNombre,
      usdtAmount,
      piskAmount,
      fromWallet: fromAddr,
      fecha: new Date().toISOString(),
      comisionesPagadas: false
    };

    // Calcular y registrar comisiones de referidos
    let comisionInfo = '';
    if (comprador.referido_por) {
      const ref1 = findUserByCodigo(comprador.referido_por);
      if (ref1) {
        const c1_usdt = usdtAmount * 0.05;
        const c1_pisk = piskAmount * 0.05;
        ref1.comisiones_usdt += c1_usdt;
        ref1.comisiones_pisk += c1_pisk;
        compra.ref1 = { id: ref1.id, nombre: ref1.nombre, wallet: ref1.wallet, usdt: c1_usdt, pisk: c1_pisk };
        comisionInfo += `\n👤 *Nivel 1:* ${ref1.nombre} → $${c1_usdt.toFixed(4)} USDT + ${c1_pisk.toFixed(2)} $PISK`;

        // Notificar al referidor nivel 1
        if (ref1.wallet) {
          bot.sendMessage(ref1.id,
            `💰 *¡Comisión ganada!*\n\n` +
            `👤 *${compradorNombre}* compró $${usdtAmount.toFixed(2)} USDT en $PISK\n\n` +
            `🎁 *Tu comisión (10%):*\n` +
            `   💵 ${c1_usdt.toFixed(4)} USDT\n` +
            `   🪙 ${c1_pisk.toFixed(2)} $PISK\n\n` +
            `📤 Se enviará a: \`${ref1.wallet}\`\n` +
            `_Pago manual por el admin en las próximas 24h_`,
            { parse_mode: 'Markdown' }
          ).catch(() => {});
        }

        // Nivel 2
        if (ref1.referido_por) {
          const ref2 = findUserByCodigo(ref1.referido_por);
          if (ref2) {
            const c2_usdt = usdtAmount * 0.015;
            const c2_pisk = piskAmount * 0.015;
            ref2.comisiones_usdt += c2_usdt;
            ref2.comisiones_pisk += c2_pisk;
            compra.ref2 = { id: ref2.id, nombre: ref2.nombre, wallet: ref2.wallet, usdt: c2_usdt, pisk: c2_pisk };
            comisionInfo += `\n👤 *Nivel 2:* ${ref2.nombre} → $${c2_usdt.toFixed(4)} USDT + ${c2_pisk.toFixed(2)} $PISK`;

            // Nivel 3
            if (ref2.referido_por) {
              const ref3 = findUserByCodigo(ref2.referido_por);
              if (ref3) {
                const c3_usdt = usdtAmount * 0.005;
                const c3_pisk = piskAmount * 0.005;
                ref3.comisiones_usdt += c3_usdt;
                ref3.comisiones_pisk += c3_pisk;
                compra.ref3 = { id: ref3.id, nombre: ref3.nombre, wallet: ref3.wallet, usdt: c3_usdt, pisk: c3_pisk };
                comisionInfo += `\n👤 *Nivel 3:* ${ref3.nombre} → $${c3_usdt.toFixed(4)} USDT + ${c3_pisk.toFixed(2)} $PISK`;
              }
            }
          }
        }
      }
    }

    db.compras.push(compra);
    saveDB();

    // Confirmar al comprador
    bot.sendMessage(compradorId,
      `✅ *¡Compra registrada!*\n\n` +
      `🪙 Recibiste: *${piskAmount} $PISK*\n` +
      `💵 Pagaste: $${usdtAmount.toFixed(2)} USDT\n` +
      `🔗 TX: \`${txHash.slice(0,20)}...\`\n\n` +
      `_¡Gracias por invertir en Neo Pisk!_ 🚀`,
      { parse_mode: 'Markdown' }
    );

    // Notificar al ADMIN
    bot.sendMessage(ADMIN_ID,
      `🛒 *NUEVA COMPRA DETECTADA*\n\n` +
      `👤 Comprador: *${compradorNombre}* (ID: ${compradorId})\n` +
      `💼 Wallet: \`${fromAddr}\`\n` +
      `💵 USDT: *$${usdtAmount.toFixed(4)}*\n` +
      `🪙 PISK: *${piskAmount}*\n` +
      `🔗 TX: [Ver en Polygon](https://polygonscan.com/tx/${txHash})\n\n` +
      `💰 *COMISIONES A PAGAR:*${comisionInfo || '\n_Sin referidor_'}\n\n` +
      `⚡ *Acción requerida:* Envía los pagos de comisión desde tu wallet\n` +
      `📊 [Ver en Panel](https://neopisk.lat/panel-airdrop.html)`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

  } catch(e) {
    console.error('Error verificando TX:', e);
    bot.sendMessage(compradorId, `❌ Error verificando la transacción. Intenta más tarde o contacta al soporte.`);
  }
}

// ── MONITOR AUTOMÁTICO DE BLOCKCHAIN ──────────────────────────────────────
// Cada 5 minutos revisa nuevas transacciones al contrato
async function monitorBlockchain() {
  try {
    const url = `${POLYGON_API}?module=account&action=txlist&address=${CONTRACT}&startblock=0&endblock=99999999&sort=desc&apikey=YourPolygonScanAPIKey`;
    const data = await fetchJSON(url);
    if (!data.result || !Array.isArray(data.result)) return;

    const nuevas = data.result.filter(tx =>
      tx.functionName?.includes('buyWithUSDT') &&
      tx.txreceipt_status === '1' &&
      !db.compras.find(c => c.txHash === tx.hash)
    );

    for (const tx of nuevas) {
      // Buscar si el comprador está registrado en nuestro bot
      const comprador = findUserByWallet(tx.from);
      if (comprador) {
        console.log(`🔍 Nueva compra detectada para ${comprador.nombre}: ${tx.hash}`);
        await verificarTxHash(tx.hash, comprador.id, comprador.nombre);
        await sleep(2000); // evitar spam
      }
    }
  } catch(e) {
    // silencioso
  }
}

setInterval(monitorBlockchain, 5 * 60 * 1000); // cada 5 min

// ── API ENDPOINTS ─────────────────────────────────────────────────────────
app.get('/ref-info', (req, res) => {
  const { uid } = req.query;
  if (!uid || !db.usuarios[uid]) return res.json({ ok: false });
  const u = db.usuarios[uid];
  res.json({
    ok: true,
    codigo_ref: u.codigo_ref,
    referido_por: u.referido_por,
    mis_referidos: u.mis_referidos.length,
    compras_usdt: u.compras_usdt,
    comisiones_usdt: u.comisiones_usdt,
    wallet: u.wallet
  });
});

app.post('/registrar-wallet', (req, res) => {
  const { uid, wallet } = req.body;
  if (!uid || !wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.json({ ok: false, error: 'Datos inválidos' });
  }
  const u = getUser(uid, 'Usuario');
  u.wallet = wallet;
  saveDB();
  res.json({ ok: true });
});

app.post('/registrar-compra', (req, res) => {
  const { uid, nombre, txHash } = req.body;
  if (!uid || !txHash) return res.json({ ok: false });
  verificarTxHash(txHash, parseInt(uid), nombre || 'Usuario');
  res.json({ ok: true, message: 'Verificando...' });
});

app.get('/mis-referidos', (req, res) => {
  const { uid } = req.query;
  if (!uid || !db.usuarios[uid]) return res.json([]);
  const u = db.usuarios[uid];
  const refs = u.mis_referidos.map(id => {
    const r = db.usuarios[id];
    if (!r) return null;
    return { nombre: r.nombre, pisk: r.pisk_recibido, usdt: r.compras_usdt };
  }).filter(Boolean);
  res.json(refs);
});

// ── UTILIDADES ────────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── INICIAR ───────────────────────────────────────────────────────────────
app.listen(3005, () => console.log('🤖 API Referidos corriendo en puerto 3005'));
console.log('🚀 Neo Pisk Airdrop Bot v2 iniciado');
console.log(`📊 Usuarios en DB: ${Object.keys(db.usuarios).length}`);

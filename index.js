const config = require('./config.js');
require('./backup.js'); // <-- Tumhari backup file yahan attach ho gayi

const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const http = require('http');

// Connect MongoDB Cloud
mongoose.connect(config.MONGO_URI)
    .then(() => console.log("✅ MongoDB Cloud Connected Successfully!"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Database Schemas
const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    name: { type: String, default: 'User' },
    refs: { type: Number, default: 0 },
    refBy: { type: Number, default: null },
    counted: { type: Boolean, default: false },
    requests: { type: [Number], default: [] },
    adminState: { type: String, default: null },
    tempCh: { id: Number, title: String }
});
const User = mongoose.model('User', userSchema);

const channelSchema = new mongoose.Schema({
    title: String,
    channelId: { type: Number, default: null },
    link: String,
    isFolder: { type: Boolean, default: false }
});
const Channel = mongoose.model('Channel', channelSchema);

// UI Helpers
function pe(id, normalEmoji = '') {
    return id ? `<tg-emoji emoji-id="${id}">${normalEmoji}</tg-emoji>` : normalEmoji;
}

function btn(text, normalEmoji, emojiId, action, style = '') {
    const b = {};
    if (action.startsWith('http') || action.startsWith('tg://')) {
        b.url = action;
    } else {
        b.callback_data = action;
    }
    if (style) b.style = style;

    if (emojiId) {
        b.text = text.trim();
        b.icon_custom_emoji_id = emojiId;
    } else {
        b.text = `${normalEmoji} ${text}`.trim();
    }
    return b;
}

function toSmallCaps(str) {
    const normal = 'abcdefghijklmnopqrstuvwxyz';
    const small  = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀѕᴛᴜᴠᴡxʏᴢ';
    return str.toLowerCase().split('').map(c => {
        const idx = normal.indexOf(c);
        return idx !== -1 ? small[idx] : c;
    }).join('');
}

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// 1. CATCH PRIVATE CHANNEL JOIN REQUESTS
bot.on('chat_join_request', async (req) => {
    const reqUser = req.from.id;
    const reqChat = req.chat.id;

    let u = await User.findOne({ userId: reqUser });
    if (!u) u = await User.create({ userId: reqUser, name: req.from.first_name || 'User' });

    if (!u.requests.includes(reqChat)) {
        u.requests.push(reqChat);
        await u.save();
    }
});

// 2. START COMMAND HANDLER
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'User';
    const startParam = match[1]; 

    if (chatId === config.ADMIN_ID && !startParam) {
        await User.findOneAndUpdate({ userId: config.ADMIN_ID }, { adminState: null }, { upsert: true });
        const kb = {
            keyboard: [
                [{ text: 'Total Users' }, { text: 'Broadcast' }],
                [{ text: 'Manage Channels' }, { text: 'Manage Folders' }],
                [{ text: 'Check Refferal Board' }]
            ],
            resize_keyboard: true
        };
        return bot.sendMessage(chatId, `${pe(config.EMOJI.crown, '👑')} <b>Welcome Admin</b>`, { parse_mode: 'HTML', reply_markup: kb });
    }

    let u = await User.findOne({ userId: chatId });
    const refBy = (startParam && !isNaN(startParam) && Number(startParam) !== chatId) ? Number(startParam) : null;

    if (!u) {
        u = await User.create({ userId: chatId, name: firstName, refBy: refBy });
    } else if (u.refBy === null && refBy !== null && !u.counted) {
        u.refBy = refBy;
        u.name = firstName;
        await u.save();
    }

    const userLink = `<a href="tg://user?id=${chatId}">${firstName}</a>`;
    const cap = `${pe(config.EMOJI.wave, '👋')} <b>Hey - ${userLink}</b>\n\n${pe(config.EMOJI.star_eyes, '🤩')} <b>Join Below Channels And Tap Verify To Continue</b>`;

    const channels = await Channel.find();
    const joinButtons = channels.map(ch => {
        const lbl = ch.isFolder ? 'Join Folder' : 'Join';
        return btn(lbl, '❤️‍🔥', config.EMOJI.heart_fire, ch.link, 'primary');
    });

    const grid = [];
    for (let i = 0; i < joinButtons.length; i += 2) {
        grid.push(joinButtons.slice(i, i + 2));
    }
    grid.push([ btn('Verify', '✅', config.EMOJI.green_tick_old, 'verify_channels', 'success') ]);

    bot.sendPhoto(chatId, config.IMAGE_URL, {
        caption: cap,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: grid }
    });
});

// 3. TEXT & ADMIN STATE HANDLERS
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/start')) return;
    const chatId = msg.chat.id;
    const text = msg.text;

    if (chatId !== config.ADMIN_ID) return;

    const admin = await User.findOne({ userId: config.ADMIN_ID });
    const state = admin?.adminState;

    if (state === 'ADD_CH_STEP1') {
        if (msg.forward_from_chat) {
            const fChat = msg.forward_from_chat;
            admin.tempCh = { id: fChat.id, title: fChat.title || 'Channel' };
            admin.adminState = 'ADD_CH_STEP2';
            await admin.save();

            return bot.sendMessage(chatId, `${pe(config.EMOJI.star_eyes, '🤩')} <b>Channel Auto-Detected!</b>\n\n📢 <b>Name:</b> ${fChat.title}\n🆔 <b>ID:</b> <code>${fChat.id}</code>\n\n🔗 <b>Step 2:</b> Now Send Link Of This Channel`, { parse_mode: 'HTML' });
        } else {
            return bot.sendMessage(chatId, "❌ <b>Invalid Message Type, Forward Message Direct From Channel Without Hide Channel Name</b>", { parse_mode: 'HTML' });
        }
    }

    if (state === 'ADD_CH_STEP2') {
        if (!text.includes('t.me')) return bot.sendMessage(chatId, "❌ Send Correct Channel Link");

        await Channel.create({ title: admin.tempCh.title, channelId: admin.tempCh.id, link: text.trim(), isFolder: false });
        admin.adminState = null;
        admin.tempCh = undefined;
        await admin.save();

        return bot.sendMessage(chatId, `${pe(config.EMOJI.green_tick, '✅')} <b>Channel Successfully Added!</b>`, { parse_mode: 'HTML' });
    }

    if (state === 'ADD_FOLDER') {
        if (!text.includes('t.me/')) return bot.sendMessage(chatId, "❌ Send Correct Telegram Folder Link");

        await Channel.create({ title: 'Folder', channelId: null, link: text.trim(), isFolder: true });
        admin.adminState = null;
        await admin.save();

        return bot.sendMessage(chatId, `${pe(config.EMOJI.green_tick, '✅')} <b>Folder Successfully Added!</b>`, { parse_mode: 'HTML' });
    }

    if (state === 'BROADCAST') {
        admin.adminState = null;
        await admin.save();

        bot.sendMessage(chatId, "⏳ <b>Broadcast Started...</b>", { parse_mode: 'HTML' });
        const users = await User.find({ userId: { $ne: config.ADMIN_ID } });
        let sent = 0;

        for (const target of users) {
            try {
                if (msg.photo) await bot.sendPhoto(target.userId, msg.photo[msg.photo.length - 1].file_id, { caption: msg.caption || '', parse_mode: 'HTML' });
                else if (msg.video) await bot.sendVideo(target.userId, msg.video.file_id, { caption: msg.caption || '', parse_mode: 'HTML' });
                else await bot.sendMessage(target.userId, text, { parse_mode: 'HTML' });
                sent++;
            } catch (e) {}
        }
        return bot.sendMessage(chatId, `✅ <b>Broadcast Completed!</b> Sent to ${sent} users.`, { parse_mode: 'HTML' });
    }

    if (text === 'Total Users') {
        const total = await User.countDocuments();
        return bot.sendMessage(chatId, `${pe(config.EMOJI.star, '⭐')} <b>Total Users:</b> ${total}`, { parse_mode: 'HTML' });
    }
    if (text === 'Broadcast') {
        await User.findOneAndUpdate({ userId: config.ADMIN_ID }, { adminState: 'BROADCAST' }, { upsert: true });
        return bot.sendMessage(chatId, "📢 <b>Send Broadcast Msg</b>", { parse_mode: 'HTML' });
    }
    if (text === 'Manage Channels') {
        const kb = { inline_keyboard: [
            [{ text: '➕ Add Channel', callback_data: 'adm_add_ch', style: 'primary' }],
            [{ text: '🗑️ Remove Channel', callback_data: 'adm_rem_ch_list', style: 'danger' }]
        ]};
        return bot.sendMessage(chatId, "⚙️ <b>Manage Channels</b>", { parse_mode: 'HTML', reply_markup: kb });
    }
    if (text === 'Manage Folders') {
        const kb = { inline_keyboard: [
            [{ text: '➕ Add Folder', callback_data: 'adm_add_folder', style: 'primary' }],
            [{ text: '🗑️ Remove Folder', callback_data: 'adm_rem_folder_list', style: 'danger' }]
        ]};
        return bot.sendMessage(chatId, "📁 <b>Manage Chat Folders</b>", { parse_mode: 'HTML', reply_markup: kb });
    }
    if (text === 'Check Refferal Board') {
        const top = await User.find().sort({ refs: -1 }).limit(10);
        let boardMsg = `${pe(config.EMOJI.crown, '👑')} <b>Top Referrers:</b>\n\n`;
        top.forEach((userDoc, idx) => {
            boardMsg += `${idx + 1}. <a href="tg://user?id=${userDoc.userId}">${userDoc.name}</a> - <b>${userDoc.refs} Refs</b>\n`;
        });
        return bot.sendMessage(chatId, boardMsg, { parse_mode: 'HTML' });
    }
});

// 4. CALLBACK QUERY HANDLER
bot.on('callback_query', async (query) => {
    const cbId = query.id;
    const cbData = query.data;
    const cbChatId = query.message.chat.id;
    const cbMsgId = query.message.message_id;

    if (cbData === 'adm_add_ch') {
        await User.findOneAndUpdate({ userId: cbChatId }, { adminState: 'ADD_CH_STEP1' }, { upsert: true });
        bot.sendMessage(cbChatId, "📢 <b>Step 1:</b> Forward Any Message From Your Public Or Private Channel.", { parse_mode: 'HTML' });
        return bot.answerCallbackQuery(cbId);
    }

    if (cbData === 'adm_add_folder') {
        await User.findOneAndUpdate({ userId: cbChatId }, { adminState: 'ADD_FOLDER' }, { upsert: true });
        bot.sendMessage(cbChatId, "📁 <b>Send Folder Invite Link:</b>", { parse_mode: 'HTML' });
        return bot.answerCallbackQuery(cbId);
    }

    if (cbData === 'adm_rem_ch_list') {
        const list = await Channel.find({ isFolder: false });
        if (list.length === 0) return bot.answerCallbackQuery(cbId, { text: "No Channels Found!", show_alert: true });
        const kb = list.map(c => ([{ text: `❌ Remove: ${c.title}`, callback_data: `del_ch_${c._id}`, style: 'danger' }]));
        return bot.editMessageText("Select channel to remove:", { chat_id: cbChatId, message_id: cbMsgId, reply_markup: { inline_keyboard: kb } });
    }

    if (cbData === 'adm_rem_folder_list') {
        const list = await Channel.find({ isFolder: true });
        if (list.length === 0) return bot.answerCallbackQuery(cbId, { text: "No Folders Found!", show_alert: true });
        const kb = list.map(c => ([{ text: `❌ Remove Folder: ${c.link.slice(-10)}`, callback_data: `del_ch_${c._id}`, style: 'danger' }]));
        return bot.editMessageText("Select folder to remove:", { chat_id: cbChatId, message_id: cbMsgId, reply_markup: { inline_keyboard: kb } });
    }

    if (cbData.startsWith('del_ch_')) {
        await Channel.findByIdAndDelete(cbData.replace('del_ch_', ''));
        bot.answerCallbackQuery(cbId, { text: "Removed Successfully!" });
        return bot.deleteMessage(cbChatId, cbMsgId);
    }

    // VERIFICATION CHECKER
    if (cbData === 'verify_channels') {
        const channels = await Channel.find();
        let u = await User.findOne({ userId: cbChatId });
        if (!u) u = await User.create({ userId: cbChatId, name: query.from.first_name || 'User' });

        let allPassed = true;

        for (const ch of channels) {
            if (ch.isFolder) continue; 
            if (u.requests.includes(ch.channelId)) continue; 

            try {
                const res = await bot.getChatMember(ch.channelId, cbChatId);
                if (['left', 'kicked'].includes(res.status)) {
                    allPassed = false;
                    break;
                }
            } catch (err) {
                allPassed = false;
                break;
            }
        }

        if (!allPassed) {
            return bot.answerCallbackQuery(cbId, { text: "⚠️ First Join All Channel Then Click On Verify", show_alert: true });
        }

        if (!u.counted && u.refBy) {
            const referrer = await User.findOne({ userId: u.refBy });
            if (referrer) {
                referrer.refs += 1;
                await referrer.save();
                bot.sendMessage(referrer.userId, `${pe(config.EMOJI.bell, '🔔')} <b>New Referral Verified!</b>`, { parse_mode: 'HTML' }).catch(()=>{});
            }
            u.counted = true;
            await u.save();
        }

        await bot.deleteMessage(cbChatId, cbMsgId);
        const btnVid = btn('Get Video', '❤', config.EMOJI.red_heart, 'open_ref_dashboard', 'danger');

        return bot.sendPhoto(cbChatId, config.IMAGE_URL, {
            caption: `${pe(config.EMOJI.gift, '🎁')} <b>Verification Successful! Click Below To Access.</b>`,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[ btnVid ]] }
        });
    }

    // REFERRAL DASHBOARD
    if (cbData === 'open_ref_dashboard' || cbData === 'check_ref_limit') {
        const u = await User.findOne({ userId: cbChatId });
        const refs = u?.refs || 0;

        if (refs < config.REQUIRED_REFS) {
            const t1 = toSmallCaps(`you must have ${config.REQUIRED_REFS} refferal to get video`);
            const t2 = toSmallCaps("your current refferal count") + ` - <b>${refs}</b>`;
            const t3 = toSmallCaps("your refferal link") + " -";
            const refLink = `https://t.me/${config.BOT_USERNAME}?start=${cbChatId}`;

            const cap = `${pe(config.EMOJI.diamond, '💎')} <b>${t1}</b>\n\n${pe(config.EMOJI.star, '⭐')} ${t2}\n\n${pe(config.EMOJI.fire, '🔥')} <b>${t3}</b>\n<code>${refLink}</code>`;

            const kb = [
                [ btn('My Refferal Count', '⭐', config.EMOJI.star, 'check_ref_limit', 'primary') ],
                [ btn('Get Video', '❤', config.EMOJI.red_heart, 'check_ref_limit', 'success') ]
            ];

            await bot.deleteMessage(cbChatId, cbMsgId);
            return bot.sendPhoto(cbChatId, config.IMAGE_URL, { caption: cap, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
        } else {
            bot.answerCallbackQuery(cbId, { text: "🎉 Access Granted!" });
            return bot.sendMessage(cbChatId, `${pe(config.EMOJI.pink_heart, '💖')} <b>Here is your Link:</b>\nhttps://example.com`, { parse_mode: 'HTML' });
        }
    }
});

// Railway Health Check Port Open
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Active!');
}).listen(PORT, () => {
    console.log(`🌐 Railway Port ${PORT} Alive`);
});

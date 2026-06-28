module.exports = {
    // Railway ka MongoDB variable auto-detect karega
    MONGO_URI: process.env.MONGO_URL || "mongodb://localhost:27017/telegram_bot",
    
    BOT_TOKEN: "8494866965:AAFalbEHT9kWU8J38DXzz_hkw-ueDFj8640",
    ADMIN_ID: 5291409360, // <-- Yahan apni numeric Telegram ID dalo
    BOT_USERNAME: "InstaleakszBot",
    REQUIRED_REFS: 2,
    IMAGE_URL: "https://i.ibb.co/YnzthD9/x.jpg",

    EMOJI: {
        wave: '4956656232568980478',
        star_eyes: '4956611513369494230',
        heart_fire: '4958689671950369798',
        green_tick_old: '6159225205475516447',
        red_heart: '4956222745814762495',
        crown: '4956420859771225351',
        fire: '4956499161319998529',
        gift: '4956418939920843885',
        star: '4956591756519932897',
        bell: '6255558710584675000',
        diamond: '6255520094533716616',
        pink_heart: '6253316402648713976',
        green_tick: '6255591515544882364'
    }
};

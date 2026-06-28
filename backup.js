const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();

// Master Bot authentication key
const SECRET_KEY = process.env.BACKUP_SECRET_KEY || 'Spadebotbackup';

// Master Bot is URL pe request marega data lene ke liye
app.get('/get-data', async (req, res) => {
    // 1. Key Match Check
    if (req.query.key !== SECRET_KEY) {
        return res.status(403).json({ error: 'Unauthorized Access' });
    }
    
    try {
        // 2. MongoDB Connect
        const client = new MongoClient(process.env.MONGO_URL);
        await client.connect();
        
        // 3. Database detect aur select karna (VipBotDB default set hai)
        const db = client.db('test'); 
        const collections = await db.listCollections().toArray();
        
        let dbDump = {};
        
        // 4. Har collection ka data nikalna
        for (let col of collections) {
            dbDump[col.name] = await db.collection(col.name).find({}).toArray();
        }
        
        await client.close();
        
        // 5. Master Bot ko JSON format mein data bhejna
        res.json(dbDump);
        
    } catch (error) {
        console.error("Backup Fetch Error:", error);
        res.status(500).json({ error: "Database fetch error: " + error.message });
    }
});

// Server start karna (Jo Master Bot ka intezar karega)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Spade Backup API successfully running on port ${PORT}`);
});

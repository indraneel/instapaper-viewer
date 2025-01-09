const fs = require("fs");
const Epub = require("epub-gen");
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const Instapaper = require('instapaper-node-sdk');
const client = new Instapaper(
    process.env.INSTAPAPER_CLIENT_ID,
    process.env.INSTAPAPER_CLIENT_SECRET
);
client.setCredentials(
    process.env.INSTAPAPER_EMAIL,
    process.env.INSTAPAPER_PASSWORD
);

let bookmarks = [];

client.list({
    'limit': 500
})
.then(data => { 
    // Handle string response and NaN values
    let bookmarkData;
    if (typeof data === 'string') {
        // Replace NaN values with null before parsing
        const cleanedData = data.replace(/: NaN/g, ': null');
        bookmarkData = JSON.parse(cleanedData);
    } else {
        bookmarkData = data;
    }
    
    // Find bookmark objects
    const bookmarkItems = bookmarkData.filter(item => item.type === 'bookmark');
    
    // Process bookmarks, handling NaN values
    bookmarks = bookmarkItems.map(d => ({
        ...d, 
        progress_timestamp: d.progress_timestamp ? Number(d.progress_timestamp) * 1000 : null,
        time: Number(d.time) * 1000,
        progress: isNaN(d.progress) ? 0 : Number(d.progress)
    }));
    
    console.log(`Found ${bookmarks.length} bookmarks`);
    
    // Write processed bookmarks to JSON file for backup
    fs.writeFileSync('./bookmarks.json', JSON.stringify(bookmarks, null, 2), 'utf-8');
    
    const preprocessBookmark = (bm) => {
        return client.getText(bm.bookmark_id)
            .then((text) => {
                return Promise.resolve([
                    bm.title,
                    bm.url,
                    text,
                    bm.hash,
                    bm.bookmark_id,
                    bm.time,
                    bm.progress_timestamp,
                    bm.progress,
                    false,
                    null,
                    null
                ]);
            })
            .catch((e) => {
                console.log(`Failed to get text for bookmark ${bm.bookmark_id}:`, e);
                return Promise.resolve([
                    bm.title,
                    bm.url,
                    '',
                    bm.hash,
                    bm.bookmark_id,
                    bm.time,
                    bm.progress_timestamp,
                    bm.progress,
                    false,
                    null,
                    null
                ]);
            });
    };

    const getBookmarkPromises = bookmarks.map(bm => preprocessBookmark(bm));
    return Promise.all(getBookmarkPromises);
})
.then(bookmarkResponsesArr => {
    const db = new sqlite3.Database('instapaper.db');
    
    // Create table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS articles (
        title TEXT,
        url TEXT,
        text TEXT,
        hash TEXT PRIMARY KEY,
        bookmark_id INTEGER,
        time INTEGER,
        progress_timestamp INTEGER,
        progress REAL,
        archived BOOLEAN,
        highlights TEXT,
        folder_id INTEGER
    )`, (err) => {
        if (err) {
            console.error('Error creating table:', err);
            return;
        }

        let processedCount = 0;
        bookmarkResponsesArr.forEach((response) => {
            if (response[1] && response[1] !== '') {
                db.run(`INSERT OR IGNORE INTO articles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                    response, 
                    function(err) {  // Changed to regular function to access this.sql
                        // Log the executed SQL with values
                        console.log('Executed query:', this.sql);
                        
                        if (err) {
                            console.log('Database error:', err.name, err.message);
                        } else {
                            processedCount++;
                            if (processedCount % 10 === 0) {
                                console.log(`Processed ${processedCount} bookmarks`);
                            }
                        }

                        if (processedCount === bookmarkResponsesArr.length) {
                            console.log(`Completed processing ${processedCount} bookmarks`);
                            db.close((err) => {
                                if (err) {
                                    console.error('Error closing database:', err.message);
                                } else {
                                    console.log('Database operations completed and connection closed');
                                }
                            });
                        }
                    }
                );
            }
        });
    });
})
.catch(err => {
    console.error('Error in processing:', err);
    console.error('Error details:', err.stack);
});

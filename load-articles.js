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

bookmarks = [];

client.list({
    'limit': 500
})
.then(data => { 
    data.shift(); // throw out meta object
    user = data[0]; // store user object 
    data.shift(); // throw out user object 
    data.map(d => ({...d, progress_timestamp: d['progress_timestamp']*1000, time: d.time*1000})).forEach(dm => bookmarks.push(dm));
})
.then(() => {
    fs.writeFileSync('./bookmarks.json', JSON.stringify(bookmarks, null, 2) , 'utf-8');
    const preprocessBookmark = (bm) => {
        return client.getText(bm.bookmark_id).then((text) => {
            return Promise.resolve([bm.title, bm.url, text, bm.hash, bm.bookmark_id, bm.time, bm.progress_timestamp, bm.progress, false]);
        }).catch((e) => {
            return Promise.resolve([bm.title, bm.url, '', bm.hash, bm.bookmark_id, bm.time, bm.progress_timestamp, bm.progress, false]);
        });
    }
    const getBookmarkPromises = bookmarks.map(bm => preprocessBookmark(bm));
    Promise.all(getBookmarkPromises)
    .then(bookmarkResponsesArr => {
        const db = new sqlite3.Database('instapaper.db');
        bookmarkResponsesArr.forEach((response) => {
            if (response[1] && response[1] != '') {
                console.log(response);
                db.run(`INSERT OR REPLACE INTO articles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, response, (err) => {
                    if (err) {
                        console.log(err.name, err.message)
                    }
                })
            }
        });
    });
})

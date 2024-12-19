const express = require("express");
const path = require("path");
const cors = require("cors");
const Epub = require("epub-gen");
const sqlite3 = require("sqlite3").verbose();
const open = require("sqlite").open;
require('dotenv').config();
const app = express();
const port = 3000;

const Instapaper = require("instapaper-node-sdk");
const client = new Instapaper(
  process.env.INSTAPAPER_CLIENT_ID,
  process.env.INSTAPAPER_CLIENT_SECRET
);
client.setCredentials(process.env.INSTAPAPER_EMAIL, process.env.INSTAPAPER_PASSWORD);
const db = new sqlite3.Database("./instapaper.db");

const listDb = (limit, start) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM articles ORDER BY time DESC ${limit ? `LIMIT ${limit}` : ''};`,
      (err, rows) => {
        if (err) {
          reject(err.message);
        } else {
          resolve(rows);
        }
      },
    );
  });
};

const getTextDb = (id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM articles WHERE bookmark_id = ${id};`, (err, row) => {
      if (err) {
        // console.log(err.message);
        reject(err.message);
      } else {
        // console.log(row);
        resolve(row.text);
      }
    });
  });
};

const archiveDb = (id) => {
    return new Promise((resolve, reject) => {
	db.run(`UPDATE articles SET archived = 'true' WHERE bookmark_id = ${id}`, (err) => {
	  if (err) {
	    // console.log(err.message);
	    reject(err.message);
	  } else {
	    // console.log(row);
	    resolve(true);
	  }
	})
    });
}

user = {};
bookmarks = [];
options = {
  limit: 500,
};

app.use(
  cors({
    origin: "*",
  }),
);

app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, "/index.html"));
});

app.get("/load", function (req, res) {
  const db = new sqlite3.Database("./instapaper.db");
  db.run(`DELETE FROM articles;`, (err) => {
    if (err) return console.log(err.message);
    console.log(`row was added to the table: ${this.lastID}`);
  });
  let sql = `INSERT INTO articles(title, url, text, hash, bookmark_id, time, progress_timestamp, progress) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  console.log(db);
  bookmarks = [];
  bookmarkText = {};
  client
    .list(options)
    .then((data) => {
      data.shift(); // throw out meta object
      user = data[0]; // store user object
      data.shift(); // throw out user object
      data
        .map((d) => ({
          ...d,
          progress_timestamp: d["progress_timestamp"] * 1000,
          time: d.time * 1000,
        }))
        .forEach((dm) => bookmarks.push(dm));
    })
    .then(() => {
      bookmarks.forEach((b, index) => {
        console.log(index);
        client.getText(b.bookmark_id).then((text) => {
          bookmarkText[b.bookmark_id] = text;
        });
      });
    })
    .then(() => {
      console.log(bookmarkText);
      // bookmarks.forEach((b, index) => {
      //     console.log(index);
      //     db.run(sql, [
      //         b.title,
      //         b.url,
      //         bookmarkText[b.bookmark_id],
      //         b.hash,
      //         b.bookmark_id,
      //         b.time,
      //         b.progress_timestamp,
      //         b.progress
      //     ], (err) => {
      //         if (err) return console.log(err.message);
      //         console.log(`row was added to the table: ${this.lastID}`);
      //     });
      // });
    })
    .then(() => {
      console.log("finished!");
      db.close();
    });
});
app.get("/bookmarks", async function (req, res) {
  // bookmarks = [];
  // client
  //   .list(options)
  //   .then((data) => {
  //     data.shift(); // throw out meta object
  //     user = data[0]; // store user object
  //     data.shift(); // throw out user object
  //     data
  //       .map((d) => ({
  //         ...d,
  //         progress_timestamp: d["progress_timestamp"] * 1000,
  //         time: d.time * 1000,
  //       }))
  //       .forEach((dm) => bookmarks.push(dm));
  //   })
  //   .then(() => res.send(bookmarks));
  const response = await listDb();
  res.send(response);
});

app.get("/archive", async function (req, res) {
    const response = await archiveDb(req.query.id);
    res.send(response);
    /*
  client.archive(req.query.id).then((r) => {
    res.send(r);
  });
  */
});

app.get("/star", function (req, res) {
  client.star(req.query.id).then((r) => {
    res.send(r);
  });
});

app.get("/unstar", function (req, res) {
  client.unstar(req.query.id).then((r) => {
    res.send(r);
  });
});

app.get("/getText",  async function (req, res) {
  // client.getText(req.query.id).then((r) => {
  //   res.send(r);
  // });
  const response = await getTextDb(req.query.id);
  res.send(response);
});

app.listen(port, function () {
  console.log(`Instapaper mgmt app listening on port ${port}!`);
});

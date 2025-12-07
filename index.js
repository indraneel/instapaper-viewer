const express = require("express");
const path = require("path");
const cors = require("cors");
const Epub = require("epub-gen");
const sqlite3 = require("sqlite3").verbose();
const open = require("sqlite").open;
require('dotenv').config();

// Initialize RAG service (uses local LM Studio - no OpenAI needed)
const RAGService = require('./rag-service');
const ragService = new RAGService('./instapaper.db');



const app = express();
const port = 3002;

const Instapaper = require("instapaper-node-sdk");
const client = new Instapaper(
  process.env.INSTAPAPER_CLIENT_ID,
  process.env.INSTAPAPER_CLIENT_SECRET
);
client.setCredentials(process.env.INSTAPAPER_EMAIL, process.env.INSTAPAPER_PASSWORD);
const db = new sqlite3.Database("./instapaper.db");

const listDb = (limit, start) => {
  return new Promise((resolve, reject) => {
    // Construct the SQL query dynamically
    let query = `SELECT * FROM articles ORDER BY time DESC`;
    if (limit) {
      query += ` LIMIT ${limit}`;
      if (start) {
        query += ` OFFSET ${start}`;
      }
    }

    db.all(query, (err, rows) => {
      if (err) {
        reject(err.message);
      } else {
        resolve(rows);
      }
    });
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

app.get("/updateProgress", function (req, res) {
  const params = {
    bookmark_id: req.query.id,
    progress: parseFloat(req.query.progress),
    progress_timestamp: Math.floor(Date.now() / 1000) // Current timestamp in seconds
  };
  
  // Validate progress is between 0 and 1
  if (params.progress < 0 || params.progress > 1) {
    return res.status(400).send({ error: "Progress must be between 0 and 1" });
  }

  client.updateReadProgress(params).then((r) => {
    res.send(r);
  }).catch(err => {
    res.status(500).send({ error: err.message });
  });
});

app.get("/getText",  async function (req, res) {
  // client.getText(req.query.id).then((r) => {
  //   res.send(r);
  // });
  const response = await getTextDb(req.query.id);
  res.send(response);
});

// Get or generate summary for an article
app.get('/summary/:bookmarkId', async (req, res) => {
  try {
    const article = await ragService.processArticle(req.params.bookmarkId);
    console.log(article)
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json({ summary: article.summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Semantic search endpoint
app.get('/search', async (req, res) => {
  try {
    const { query, limit } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    const results = await ragService.semanticSearch(query, parseInt(limit) || 100);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch process articles (for initial setup)
app.get('/process', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100; // Default to 10 articles
    const skip = parseInt(req.query.skip) || 0;
    
    const articles = await listDb(limit, skip);
    const processed = [];
    
    for (const article of articles) {
      const result = await ragService.processArticle(article.bookmark_id);
      if (result) processed.push(result);
    }
    
    res.json({ 
      message: `Processed ${processed.length} articles`,
      skip,
      limit,
      processed 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.listen(port, async function () {
  console.log(`Instapaper mgmt app listening on port ${port}!`);
  console.log("init rag db")
  await ragService.initDB();
});

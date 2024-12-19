CREATE TABLE IF NOT EXISTS articles (
    title TEXT,
    url TEXT PRIMARY KEY,
    text TEXT,
    hash TEXT,
    bookmark_id INTEGER,
    time INTEGER,
    progress_timestamp INTEGER,
    progress INTEGER
);

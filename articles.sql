CREATE TABLE IF NOT EXISTS articles (
    title TEXT,
    url TEXT PRIMARY KEY,
    text TEXT,
    hash TEXT,
    bookmark_id INTEGER,
    time INTEGER,
    progress_timestamp INTEGER,
    progress INTEGER,
    embedding BLOB,
    summary TEXT
);

CREATE TABLE IF NOT EXISTS article_chunks (
    bookmark_id INTEGER,
    chunk_index INTEGER,
    chunk_text TEXT,
    embedding BLOB,
    PRIMARY KEY (bookmark_id, chunk_index)
);
const { OpenAI } = require('openai');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { encode, decode } = require('gpt-3-encoder');

class RAGService {
  constructor(dbPath, openaiApiKey) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.dbPath = dbPath;
    this.chunkSize = 8000; // Tokens per chunk
  }

  async initDB() {
    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });
    
    // Add chunks table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS article_chunks (
        bookmark_id INTEGER,
        chunk_index INTEGER,
        chunk_text TEXT,
        embedding BLOB,
        PRIMARY KEY (bookmark_id, chunk_index)
      );
      ALTER TABLE articles ADD COLUMN summary TEXT;
    `).catch(() => {});
  }

  chunkText(text) {
    const tokens = encode(text);
    const chunks = [];
    let currentChunk = [];
    let currentLength = 0;

    for (const token of tokens) {
      if (currentLength >= this.chunkSize) {
        chunks.push(decode(currentChunk));
        currentChunk = [];
        currentLength = 0;
      }
      currentChunk.push(token);
      currentLength++;
    }
    if (currentChunk.length > 0) {
      chunks.push(decode(currentChunk));
    }
    return chunks;
  }

  async generateEmbedding(text) {
    const response = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text
    });
    return response.data[0].embedding;
  }

  async generateSummary(text, bookmarkId) {
    const chunks = this.chunkText(text);
    const summaries = await Promise.all(chunks.map(async (chunk, index) => {
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Summarize this text segment concisely."
          },
          { role: "user", content: chunk }
        ],
        temperature: 0.3,
        max_tokens: 150
      });
      const summary = response.choices[0].message.content;
      // Write chunk summary to DB
      await this.db.run(
        'UPDATE article_chunks SET chunk_summary = ? WHERE bookmark_id = ? AND chunk_index = ?',
        [summary, bookmarkId, index]
      );
      
      return summary;
    }));
  }

  async processArticle(bookmarkId) {
    const article = await this.db.get(
      'SELECT * FROM articles WHERE bookmark_id = ?',
      bookmarkId
    );
      
    if (!article?.text) return null;
    
    // Skip if summary exists
    if (article.summary) {
      return article;
    }
  
    // Process chunks
    const chunks = this.chunkText(article.text);
    await Promise.all(chunks.map(async (chunk, index) => {
      const embedding = await this.generateEmbedding(chunk);
      await this.db.run(
        'INSERT OR REPLACE INTO article_chunks (bookmark_id, chunk_index, chunk_text, embedding) VALUES (?, ?, ?, ?)',
        [bookmarkId, index, chunk, Buffer.from(JSON.stringify(embedding))]
      );
    }));
  
    // Generate summary
    const summary = await this.generateSummary(article.text);
    await this.db.run(
      'UPDATE articles SET summary = ? WHERE bookmark_id = ?',
      [summary, bookmarkId]
    );
    article.summary = summary;
  
    return article;
  }

  async semanticSearch(query, limit = 15) {
    const queryEmbedding = await this.generateEmbedding(query);
    
    const chunks = await this.db.all(`
      SELECT 
        a.title,
        a.url,
        a.bookmark_id,
        ac.chunk_text,
        ac.embedding
      FROM article_chunks ac
      JOIN articles a ON ac.bookmark_id = a.bookmark_id
      WHERE ac.embedding IS NOT NULL
    `);

    const similarities = chunks.map(chunk => ({
      ...chunk,
      similarity: this.cosineSimilarity(
        queryEmbedding,
        JSON.parse(chunk.embedding.toString())
      )
    }));

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }
}

module.exports = RAGService;
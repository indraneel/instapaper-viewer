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
    
    // Combine all chunk summaries into one
    return summaries.join('\n\n');
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

  async semanticSearch(query, limit = 100) {
    const queryEmbedding = await this.generateEmbedding(query);
    const queryLower = query.toLowerCase();
    
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

    const similarities = chunks.map(chunk => {
      // Tier 5: Semantic content (embedding similarity) - base score 0-1
      const embeddingSimilarity = this.cosineSimilarity(
        queryEmbedding,
        JSON.parse(chunk.embedding.toString())
      );

      const titleLower = chunk.title.toLowerCase();
      const domain = this.extractDomain(chunk.url);

      // Tier 1: Domain match (partial) - base score 3.0
      const domainScore = domain.includes(queryLower) ? 3.0 : 0;

      // Tier 1b: Publication name from title (for archive.ph, t.co, etc.) - base score 3.0
      // This handles cases where URL is a shortener but title has "Article | Publication Name"
      const publication = this.extractPublicationFromTitle(chunk.title);
      const pubMatchScore = this.publicationMatchScore(query, publication);
      const publicationScore = pubMatchScore > 0 ? pubMatchScore * 3.0 : 0;

      // Tier 2: Exact title match (title contains query) - base score 2.0
      const exactTitleScore = titleLower.includes(queryLower) ? 2.0 : 0;

      // Tier 3: Semantic title match (Levenshtein) - base score 0-1
      const distance = this.levenshteinDistance(titleLower, queryLower);
      const maxLength = Math.max(titleLower.length, queryLower.length);
      const semanticTitleScore = 1 - (distance / maxLength);

      // Combined: highest tier + embedding as tiebreaker
      const tierScore = Math.max(domainScore, publicationScore, exactTitleScore, semanticTitleScore);
      const combinedScore = tierScore + (embeddingSimilarity * 0.1);

      return {
        ...chunk,
        similarity: combinedScore,
        domainScore,
        publicationScore,
        publication,
        exactTitleScore,
        semanticTitleScore,
        embeddingSimilarity
      };
    });

    // Group by bookmark_id and keep only the highest scoring chunk for each
    const bookmarkMap = new Map();
    for (const chunk of similarities) {
      const existing = bookmarkMap.get(chunk.bookmark_id);
      if (!existing || chunk.similarity > existing.similarity) {
        bookmarkMap.set(chunk.bookmark_id, chunk);
      }
    }
    
    // Convert map back to array and sort by similarity
    return Array.from(bookmarkMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j - 1] + 1,  // substitution
            dp[i - 1][j] + 1,      // deletion
            dp[i][j - 1] + 1       // insertion
          );
        }
      }
    }
    return dp[m][n];
  }

  extractDomain(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }

  /**
   * Extract publication name from title (e.g., "Article Title | The New Yorker" -> "The New Yorker")
   * Handles both " | " and " - " separators
   */
  extractPublicationFromTitle(title) {
    // Try pipe separator first (most reliable)
    const pipeMatch = title.match(/ \| ([^|]+)$/);
    if (pipeMatch) {
      return pipeMatch[1].trim();
    }

    // Try dash separator - look for " - " followed by capitalized word (publication name)
    const dashMatch = title.match(/ - ([A-Z][^-]*)$/);
    if (dashMatch) {
      return dashMatch[1].trim();
    }

    return null;
  }

  /**
   * Normalize a string for fuzzy matching:
   * - lowercase
   * - remove "the" prefix
   * - remove spaces and punctuation
   */
  normalizeForMatch(str) {
    return str
      .toLowerCase()
      .replace(/^the\s+/, '')
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Common abbreviations mapping for publications
   */
  getAbbreviations() {
    return {
      'nyt': 'newyorktimes',
      'nytimes': 'newyorktimes',
      'wapo': 'washingtonpost',
      'ft': 'financialtimes',
      'bbc': 'bbcnews',
    };
  }

  /**
   * Score how well a query matches a publication name
   * Returns 0-1 score, higher is better match
   */
  publicationMatchScore(query, publication) {
    if (!publication) return 0;

    let normQuery = this.normalizeForMatch(query);
    const normPub = this.normalizeForMatch(publication);

    // Check if query is a known abbreviation
    const abbrevs = this.getAbbreviations();
    if (abbrevs[normQuery]) {
      normQuery = abbrevs[normQuery];
    }

    // Exact match after normalization (e.g., "newyorker" -> "newyorker")
    if (normPub === normQuery) return 1.0;

    // Query is contained in publication (e.g., "yorker" in "newyorker")
    if (normPub.includes(normQuery)) return 0.9;

    // Publication is contained in query (e.g., "wsj" in "wsjnews")
    if (normQuery.includes(normPub)) return 0.85;

    // Fuzzy match using Levenshtein on normalized strings
    const distance = this.levenshteinDistance(normQuery, normPub);
    const maxLen = Math.max(normQuery.length, normPub.length);
    const similarity = 1 - (distance / maxLen);

    // Only count as a match if reasonably similar (> 0.6)
    return similarity > 0.6 ? similarity * 0.8 : 0;
  }
}

module.exports = RAGService;

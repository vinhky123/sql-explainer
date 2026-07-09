import type { FaqItem } from '@/components/layout/Faq'

export const faqs: FaqItem[] = [
  { q: 'Is SQL Explainer really free?', a: 'Yes. Every feature is free with no signup, no ads, and no tracking. The app runs entirely in your browser — your SQL never leaves your device. It is monetized via voluntary donations.' },
  { q: 'Does it send my SQL to a server?', a: 'No. Parsing, formatting, diagramming, plan analysis, and heuristic optimization all run client-side. The only network call is the optional AI panel, which sends your SQL directly to the LLM provider you configure (Groq/OpenAI/OpenRouter) using your own API key.' },
  { q: 'Which SQL dialects are supported?', a: 'PostgreSQL, MySQL, MariaDB, SQLite, T-SQL (SQL Server), DB2, BigQuery, Snowflake, Redshift, and Flink SQL. Parsing and formatting are dialect-aware via node-sql-parser and sql-formatter.' },
  { q: 'How does the execution-order flow work?', a: 'It reorders your query clauses into the logical order the database evaluates them (FROM and JOINs first, then WHERE, GROUP BY, HAVING, SELECT, DISTINCT, ORDER BY, LIMIT) and animates each step with the exact SQL snippet and a plain-English description.' },
  { q: 'What plan formats does the EXPLAIN explainer accept?', a: 'PostgreSQL EXPLAIN (ANALYZE, FORMAT JSON) output (the stable, recommended path) and indented text plans. The tree is color-heated by exclusive/self time so the real bottleneck surfaces, with bottleneck detection for seq scans, sort spills, stale stats, and more.' },
  { q: 'Is my AI API key safe?', a: 'Your key is stored only in your browser localStorage and is sent directly to your chosen provider — never to our servers. We are not responsible for any usage charges incurred by your key.' },
  { q: 'Can I use this offline?', a: 'The core tools work offline once loaded since they are fully client-side. The AI panel and Google Fonts require a connection, but the app degrades gracefully.' },
  { q: 'How are relationships inferred in the ERD?', a: 'Explicit FOREIGN KEY constraints are detected from DDL. For columns with no explicit FK but a name like user_id or order_id, SQL Explainer guesses a link to a matching table (users, orders) and marks the edge as inferred (dashed) so you can confirm or delete it.' },
  { q: 'Can I export the ERD?', a: 'Yes. The ERD canvas exports to DBML (for dbdiagram.io), PNG, and SVG.' },
]

export const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
}

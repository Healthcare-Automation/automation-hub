import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseFeedXml } from '../lib/marketing/adapters/rss'

const RSS2_FIXTURE = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Dental Trade Press</title>
    <item>
      <title><![CDATA[Practices see rise in no-show rates & confirmation tech]]></title>
      <link>https://example.com/articles/no-show-rise</link>
      <pubDate>Tue, 01 Sep 2026 10:00:00 GMT</pubDate>
      <dc:creator>Jane Reporter</dc:creator>
      <description><![CDATA[<p>A look at how <b>dental</b> practices are adopting two-way texting.</p>]]></description>
    </item>
    <item>
      <title>Second article &amp; a trailing amp</title>
      <link>https://example.com/articles/second</link>
      <pubDate>Wed, 02 Sep 2026 08:30:00 GMT</pubDate>
      <description>Plain text summary, no CDATA.</description>
    </item>
  </channel>
</rss>`

const ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>r/Dentistry</title>
  <entry>
    <title>Anyone else seeing more DSO buyouts?</title>
    <link rel="alternate" href="https://www.reddit.com/r/Dentistry/comments/abc123/" />
    <published>2026-09-01T12:00:00+00:00</published>
    <updated>2026-09-01T13:00:00+00:00</updated>
    <author><name>u/some_dentist</name></author>
    <summary type="html">&lt;p&gt;Curious what everyone thinks about the DSO trend.&lt;/p&gt;</summary>
  </entry>
</feed>`

test('parseFeedXml extracts RSS 2.0 items with CDATA titles/descriptions and entity decoding', () => {
  const entries = parseFeedXml(RSS2_FIXTURE)
  assert.equal(entries.length, 2)

  const [first, second] = entries
  assert.equal(first.title, 'Practices see rise in no-show rates & confirmation tech')
  assert.equal(first.link, 'https://example.com/articles/no-show-rise')
  assert.equal(first.author, 'Jane Reporter')
  assert.ok(first.publishedAt instanceof Date)
  assert.equal(first.publishedAt?.toISOString(), '2026-09-01T10:00:00.000Z')
  // HTML stripped from the description, entities decoded, whitespace collapsed.
  assert.equal(first.summary, 'A look at how dental practices are adopting two-way texting.')

  assert.equal(second.title, 'Second article & a trailing amp')
  assert.equal(second.summary, 'Plain text summary, no CDATA.')
})

test('parseFeedXml extracts Atom entries, preferring rel="alternate" links', () => {
  const entries = parseFeedXml(ATOM_FIXTURE)
  assert.equal(entries.length, 1)

  const [entry] = entries
  assert.equal(entry.title, 'Anyone else seeing more DSO buyouts?')
  assert.equal(entry.link, 'https://www.reddit.com/r/Dentistry/comments/abc123/')
  assert.equal(entry.author, 'u/some_dentist')
  assert.equal(entry.publishedAt?.toISOString(), '2026-09-01T12:00:00.000Z')
  assert.equal(entry.summary, 'Curious what everyone thinks about the DSO trend.')
})

test('parseFeedXml drops entries with no resolvable link', () => {
  const noLink = `<rss><channel><item><title>No link here</title><description>x</description></item></channel></rss>`
  assert.equal(parseFeedXml(noLink).length, 0)
})

test('parseFeedXml returns an empty array for malformed/non-feed input', () => {
  assert.deepEqual(parseFeedXml('<html><body>not a feed</body></html>'), [])
  assert.deepEqual(parseFeedXml(''), [])
})

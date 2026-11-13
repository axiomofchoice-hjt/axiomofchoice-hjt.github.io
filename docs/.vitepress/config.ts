import { defineConfig, type DefaultTheme } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareCategory } from './theme/data/meta'
import { katex } from '@mdit/plugin-katex'

// 固定构建时区为东八区：frontmatter 的 date 是北京时间，无时区后缀的日期字符串
// 会按进程时区解析。不固定的话，本地（+08:00）与 CI（UTC，如 GitHub Actions）
// 构建出的 RSS pubDate / 时间戳会相差 8 小时。此行必须在任何 new Date() 之前执行。
process.env.TZ = 'Asia/Shanghai'

// ---- 目录工具：从 posts/ 目录自动生成导航与侧边栏（目录即分类，vdoing 风格） ----

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const postsDir = path.join(docsDir, 'posts')

/** 递归遍历 posts/ 下所有 .md 文件 */
function walkMd(dir: string, cb: (file: string) => void): void {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) walkMd(full, cb)
    else if (ent.name.endsWith('.md')) cb(full)
  }
}

// ---- 构建时 frontmatter 规范化 ----
// 给缺失字段的文章自动补齐：title（文件名）、date（文件修改时间）、
// permalink（随机 6 位十六进制，风格与原站一致，自动避让已有值）、
// categories（所在目录名，即分类）。幂等：已有字段不动，无缺失不写文件。
// 新文章直接丢一个裸 .md 也能被正确收录、链接、进 RSS。

const usedPermalinks = new Set<string>()

function collectPermalinks(): void {
  walkMd(postsDir, (file) => {
    const p = fs
      .readFileSync(file, 'utf-8')
      .match(/^permalink:\s*["']?\/pages\/([0-9a-f]+)\/?/m)?.[1]
    if (p) usedPermalinks.add(p)
  })
}

function genPermalink(): string {
  let p = ''
  do {
    p = Math.floor(Math.random() * 0x1000000)
      .toString(16)
      .padStart(6, '0')
  } while (usedPermalinks.has(p))
  usedPermalinks.add(p)
  return p
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function normalizeFrontmatter(file: string): boolean {
  const raw = fs.readFileSync(file, 'utf-8')
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/)
  const fm = fmMatch ? fmMatch[1] : ''
  const hasKey = (key: string) => new RegExp(`^${key}:\\s*`, 'm').test(fm)
  const missing: string[] = []
  if (!hasKey('title')) missing.push(`title: ${JSON.stringify(path.basename(file, '.md'))}`)
  if (!hasKey('date')) missing.push(`date: ${formatDate(fs.statSync(file).mtime)}`)
  if (!hasKey('permalink')) missing.push(`permalink: /pages/${genPermalink()}/`)
  if (!hasKey('categories') && !hasKey('category')) {
    missing.push(`categories:\n  - ${path.basename(path.dirname(file))}`)
  }
  if (missing.length === 0) return false
  const insert = missing.join('\n')
  const out = fmMatch
    ? raw.replace(/^---\s*\n([\s\S]*?)\n---/, `---\n$1\n${insert}\n---`)
    : `---\n${insert}\n---\n\n${raw}`
  fs.writeFileSync(file, out, 'utf-8')
  return true
}

/** 规范化所有文章，返回被修改的文件数 */
function normalizeAllPosts(): number {
  if (!fs.existsSync(postsDir)) return 0
  collectPermalinks()
  let changed = 0
  walkMd(postsDir, (file) => {
    if (normalizeFrontmatter(file)) changed++
  })
  return changed
}

// 在配置求值前执行（rewrites / 侧栏 / RSS 都读取 frontmatter）
const normalizedCount = normalizeAllPosts()
if (normalizedCount > 0) {
  console.log(`[frontmatter] 已为 ${normalizedCount} 篇文章补齐缺失字段`)
}

/** 一篇文章 frontmatter 解析结果（侧栏 / rewrites / RSS 共用，每文件只读一次） */
interface PostMeta {
  title: string
  date: number
  dateStr: string
  permalink: string
  description: string
  category: string
  /** frontmatter 里显式 feed: false 的文章不进 RSS */
  feed: boolean
}

function readPostMeta(file: string): PostMeta {
  const raw = fs.readFileSync(file, 'utf-8')
  const fm = raw.match(/^---\s*\n([\s\S]*?)\n---/)
  const body = fm ? fm[1] : ''
  const line = (key: string) => body.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim()
  const unquote = (s: string) => s.replace(/^["']|["']$/g, '')
  const dateStr = unquote(line('date') || '')
  // categories 为 YAML 数组（vdoing 风格），取第一项；也兼容单个 category 字段
  const catIdx = body.match(/^categories:\s*$/m)
  const category = catIdx
    ? body.slice(catIdx.index! + catIdx[0].length).match(/^\s*-\s*(.+)$/m)?.[1]?.trim() || ''
    : line('category') || ''
  return {
    title: unquote(line('title') || '') || path.basename(file, '.md'),
    date: new Date(dateStr).getTime(),
    dateStr,
    permalink: body.match(/^permalink:\s*["']?(\/pages\/[0-9a-f]+\/?)/m)?.[1]?.replace(/\/$/, '') || '',
    description: unquote(line('description') || ''),
    category,
    feed: !/feed:\s*false/.test(body),
  }
}

/**
 * 文章 URL 与原站一致：用 frontmatter 里的随机十六进制 permalink（/pages/xxxxxx/）
 * 而不是 /posts/分类/标题。VitePress rewrites 把源文件映射到 permalink 路径，
 * 数据加载器中的 p.url 也会随之变为 /pages/xxxxxx/，全站链接自动生效；
 * 文章正文中原站遗留的 /pages/xxx/ 互链也原样有效。
 */
function buildRewrites(): Record<string, string> {
  if (!fs.existsSync(postsDir)) return {}
  const map: Record<string, string> = {}
  // rewrites 键是 path-to-regexp 语法：转义文件名里的正则特殊字符（括号、?、+ 等）
  const escKey = (s: string) => s.replace(/([\\\.\+\*\?\(\)\[\]\{\}])/g, '\\$1')
  walkMd(postsDir, (file) => {
    const { permalink } = readPostMeta(file)
    if (!permalink) return
    const rel = path.relative(postsDir, file)
    map[`posts/${escKey(rel)}`] = `${permalink.slice(1)}/index.md`
  })
  return map
}

function listCategories(): string[] {
  if (!fs.existsSync(postsDir)) return []
  return fs
    .readdirSync(postsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

function listCategoryPosts(category: string): DefaultTheme.SidebarItem[] {
  const dir = path.join(postsDir, category)
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { title, date, permalink } = readPostMeta(path.join(dir, f))
      // 侧栏链接与原站一致：/pages/xxxxxx/（rewrites 映射的真实页面）。
      // 尾斜杠必须保留：VitePress 用 normalize 精确匹配 active（页面路径 normalize 后为 /pages/xxxxxx/）
      return { title, date, link: permalink ? `${permalink}/` : `/posts/${category}/${f.replace(/\.md$/, '')}` }
    })
    .sort((a, b) => b.date - a.date) // 取代 vdoing 的数字前缀：按发布日期倒序
    .map(({ title, link }) => ({ text: title, link }))
}

function buildSidebar(): DefaultTheme.Sidebar {
  const groups: DefaultTheme.SidebarItem[] = listCategories()
    .sort(compareCategory)
    .map((c) => ({
      text: c,
      collapsed: true,
      items: listCategoryPosts(c),
    }))
  // 文章 URL 已改为 /pages/xxxxxx/ permalink，侧栏 key 必须匹配新路径
  return { '/pages/': groups }
}

function buildNav(): DefaultTheme.NavItem[] {
  return [
    { text: '首页', link: '/' },
    // 分类页是聚合入口：点击进入后默认展示第一个分类（分类顺序见 CATEGORY_ORDER）
    { text: '分类', link: '/categories.html' },
    { text: '归档', link: '/archives' },
    { text: '关于', link: '/pages/1919bb/' },
    { text: 'Puzzles', link: 'https://axiomofchoice-hjt.github.io/puzzles/' },
    { text: '败犬日报', link: 'https://makeinu-daily.pages.dev/' },
  ]
}

// ---- Feed 生成：构建时扫描 posts 输出 rss.xml / feed.atom / feed.json ----

const SITE_URL = 'https://axiomofchoice-hjt.github.io'

const escXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

interface RssPost {
  title: string
  url: string
  date: number
  /** frontmatter date 原始字符串（如 "2026-08-13 15:20:00"），RSS 输出需要字面值 */
  dateStr: string
  description: string
  category: string
}

const RSS_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const RSS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * RSS pubDate 与原站（vuepress-plugin-feed）逐字一致：
 * 把 frontmatter 日期字符串按字面值输出 + " GMT" 后缀（原站即如此，不做时区换算）。
 * 星期几用 Date.UTC 构造计算，与时区无关 → 无论构建机在哪个时区、TZ 是否生效，
 * 输出都固定为 "Thu, 13 Aug 2026 15:20:00 GMT"。
 */
function formatRssDate(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return new Date(dateStr).toUTCString() // 兜底：非常规格式退化为标准转换
  const [, y, mo, d, h, mi, s = '00'] = m
  const weekday = new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()
  return `${RSS_DAYS[weekday]}, ${d} ${RSS_MONTHS[+mo - 1]} ${y} ${h}:${mi}:${s} GMT`
}

/** 组装 RSS 条目；feed:false 或缺少 permalink 返回 null */
function readRssPost(file: string): RssPost | null {
  const meta = readPostMeta(file)
  if (!meta.feed || !meta.permalink) return null
  return {
    title: meta.title,
    url: `${SITE_URL}${meta.permalink}/`,
    date: meta.date,
    dateStr: meta.dateStr,
    description: meta.description,
    category: meta.category || '未分类',
  }
}

function scanRssPosts(): RssPost[] {
  if (!fs.existsSync(postsDir)) return []
  const out: RssPost[] = []
  walkMd(postsDir, (file) => {
    const post = readRssPost(file)
    if (post) out.push(post)
  })
  return out.sort((a, b) => b.date - a.date)
}

function buildRssXml(posts: RssPost[]): string {
  // 与原站（vuepress-plugin-feed）一致：日期倒序 + 截取前 50 篇
  const items = posts
    .slice(0, 50)
    .map(
      (p) => `    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${escXml(p.url)}</link>
      <guid>${escXml(p.url)}</guid>
      <pubDate>${formatRssDate(p.dateStr)}</pubDate>
      <description><![CDATA[${p.description}]]></description>
    </item>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Axiomofchoice's Blog</title>
    <link>${SITE_URL}/</link>
    <description>一个退役败犬的个人博客 (C++ / HPC / Algorithm)</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
}

/** Atom 时间与 RSS 保持同一套“字面值 + Z”策略：frontmatter 的北京时间原样输出为 UTC */
function formatAtomDate(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return new Date(dateStr).toISOString() // 兜底：非常规格式退化为标准转换
  const [, y, mo, d, h, mi, s = '00'] = m
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`
}

/** 生成 Atom 1.0 feed（feed.atom） */
function buildAtomXml(posts: RssPost[]): string {
  const entries = posts
    .slice(0, 50)
    .map(
      (p) => `  <entry>
    <title type="html"><![CDATA[${p.title}]]></title>
    <id>${escXml(p.url)}</id>
    <link href="${escXml(p.url)}">
    </link>
    <updated>${formatAtomDate(p.dateStr)}</updated>
    <summary type="html"><![CDATA[${p.description}]]></summary>
  </entry>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${SITE_URL}</id>
  <title>Axiomofchoice&apos;s Blog</title>
  <updated>${new Date().toISOString()}</updated>
  <link rel="alternate" href="${SITE_URL}/"/>
  <link rel="self" href="${SITE_URL}/feed.atom"/>
  <subtitle>一个退役败犬的个人博客 (C++ / HPC / Algorithm)</subtitle>
${entries}
</feed>
`
}

/** 生成 JSON Feed v1（feed.json） */
function buildJsonFeed(posts: RssPost[]): string {
  const feed = {
    version: 'https://jsonfeed.org/version/1',
    title: "Axiomofchoice's Blog",
    home_page_url: SITE_URL,
    feed_url: `${SITE_URL}/feed.json`,
    description: '一个退役败犬的个人博客 (C++ / HPC / Algorithm)',
    items: posts.slice(0, 50).map((p) => ({
      id: p.url,
      url: p.url,
      title: p.title,
      summary: p.description,
      date_modified: formatAtomDate(p.dateStr),
    })),
  }
  return JSON.stringify(feed, null, 4)
}

// ---- 站点配置 ----

export default defineConfig({
  lang: 'zh-CN',
  title: "Axiomofchoice's Blog",
  description: '一个退役败犬的个人博客 (C++ / HPC / Algorithm)，基于 VitePress 构建的 vdoing 风格技术博客',

  cleanUrls: true,
  ignoreDeadLinks: true,
  // 文章 URL 与原站一致：/pages/xxxxxx/ 十六进制 permalink
  rewrites: buildRewrites(),
  // 关闭全站页面 chunk 预取（141 篇文章的 chunk 合计约 18MB，按需加载可显著加快首次访问）
  router: { prefetchLinks: false },

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico', sizes: 'any' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
    ['meta', { name: 'theme-color', content: '#11a8cd' }],
    // Feed 自动发现（与原站一致：head 里声明 alternate，订阅器/浏览器可发现）
    ['link', { rel: 'alternate', type: 'application/rss+xml', href: '/rss.xml', title: "Axiomofchoice's Blog RSS Feed" }],
    ['link', { rel: 'alternate', type: 'application/atom+xml', href: '/feed.atom', title: "Axiomofchoice's Blog Atom Feed" }],
    ['link', { rel: 'alternate', type: 'application/json', href: '/feed.json', title: "Axiomofchoice's Blog JSON Feed" }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: "Axiomofchoice's Blog" }],
    ['meta', { property: 'og:description', content: '一个退役败犬的个人博客 (C++ / HPC / Algorithm)' }],
  ],

  themeConfig: {
    logo: '/favicon.ico',
    nav: buildNav(),
    sidebar: buildSidebar(),

    search: {
      provider: 'local',
      options: {
        // VitePress 本地搜索默认只索引正文中的标题/内容，不包含 frontmatter 的页面标题。
        // 这里在索引用的 HTML 前补一个 h1，让文章标题也能被搜索到。
        _render: async (src, env, md) => {
          const html = md.render(src, env)
          if (env.frontmatter?.search === false) return ''
          const title = env.frontmatter?.title
          if (!title) return html
          return `<h1 id="page-title">${escXml(String(title))}<a class="header-anchor" href="#page-title" aria-hidden="true">#</a></h1>${html}`
        },
        translations: {
          button: { buttonText: '搜索文章', buttonAriaLabel: '搜索文章' },
          modal: {
            displayDetails: '显示详细列表',
            resetButtonTitle: '清除查询条件',
            backButtonTitle: '关闭搜索',
            noResultsText: '没有找到相关文章',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },

    outline: { level: [2, 3], label: '本页目录' },
    // 关闭内置的上一篇/下一篇 footer（由主题自定义组件代替，按时间排序更符合博客习惯）
    docFooter: { prev: false, next: false },

    socialLinks: [{ icon: 'github', link: 'https://github.com/axiomofchoice-hjt' }],

    footer: {
      message: 'Powered by VitePress | Theme by Vdoing',
      copyright: 'Copyright © 2021-2026 Axiomofchoice | MIT License',
    },
  },

  markdown: {
    lineNumbers: true,
    image: { lazyLoading: true },
    // 代码复制按钮默认启用（VitePress 1.6 无 codeCopyButton 开关，仅可改按钮文案）
    // 数学公式：KaTeX（dev / build 均渲染；原站即使用 KaTeX，迁移后兼容性最佳）
    config(md) {
      md.use(katex, { throwOnError: false })
    },
    theme: { light: 'github-light', dark: 'github-dark' },
    container: {
      tipLabel: '提示',
      warningLabel: '警告',
      dangerLabel: '危险',
      infoLabel: '信息',
      detailsLabel: '详情',
    },
  },

  async buildEnd(siteConfig) {
    // 生成三种订阅格式（rss.xml / feed.atom / feed.json）
    // 首页 RSS 图标链接指向 /feed.atom，文章链接为 /pages/xxxxxx/ permalink
    const posts = scanRssPosts()
    const xml = buildRssXml(posts)
    const atom = buildAtomXml(posts)
    const json = buildJsonFeed(posts)
    fs.mkdirSync(siteConfig.outDir, { recursive: true })
    fs.writeFileSync(path.join(siteConfig.outDir, 'rss.xml'), xml)
    fs.writeFileSync(path.join(siteConfig.outDir, 'feed.atom'), atom)
    fs.writeFileSync(path.join(siteConfig.outDir, 'feed.json'), json)

    // 生成 sitemap.xml + robots.txt（固定页 + 全部 RSS 文章，零依赖；
    // feed:false 的文章与原站一致：不进 RSS，也不进 sitemap）
    const pages = [
      { url: `${SITE_URL}/`, lastmod: '' },
      { url: `${SITE_URL}/archives`, lastmod: '' },
      { url: `${SITE_URL}/categories.html`, lastmod: '' },
      { url: `${SITE_URL}/pages/1919bb/`, lastmod: '' },
      ...posts.map((p) => ({ url: p.url, lastmod: p.dateStr.slice(0, 10) })),
    ]
    const urlset = pages
      .map(
        (p) => `  <url>\n    <loc>${escXml(p.url)}</loc>${
          p.lastmod ? `\n    <lastmod>${p.lastmod}</lastmod>` : ''
        }\n  </url>`,
      )
      .join('\n')
    fs.writeFileSync(
      path.join(siteConfig.outDir, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlset}\n</urlset>\n`,
    )
    fs.writeFileSync(
      path.join(siteConfig.outDir, 'robots.txt'),
      `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    )
  },

  // 社交分享标签跟随页面内容：og:title / og:description 用文章 frontmatter，
  // 取代全局静态的站点名（否则每篇文章分享出去都是同一个标题）
  async transformHead({ pageData }) {
    const title = pageData.title || "Axiomofchoice's Blog"
    const desc =
      pageData.description || '一个退役败犬的个人博客 (C++ / HPC / Algorithm)'
    // 这里只返回要覆盖/新增的 og meta 即可；VitePress 会自动合并原有 head，
    // 避免把整个 head 再返回一遍导致 link/script 标签重复。
    return [
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: desc }],
    ]
  },

  vite: {
    optimizeDeps: {
      include: ['@mdit/plugin-katex', 'katex'],
    },
    server: {
      // dev 启动后后台预热公共模块（文章数据 / 首页 / 主题入口），减少首次打开的编译等待
      warmup: {
        clientFiles: [
          'index.md',
          '.vitepress/theme/index.ts',
          '.vitepress/theme/data/posts.data.ts',
          '.vitepress/theme/data/constants.ts',
        ],
      },
    },
  },
})

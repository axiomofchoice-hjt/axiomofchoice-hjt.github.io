import { createContentLoader } from 'vitepress'
import { SITE } from './constants'
import { countWordsFromSource } from './words'

export interface Post {
  /** 文章标题 */
  title: string
  /** 文章链接（cleanUrls 后的路径） */
  url: string
  /** 发布日期 */
  date: Date
  /** 展示用日期字符串 YYYY-MM-DD */
  dateText: string
  year: string
  month: string
  /** 分类（取自 frontmatter） */
  category: string
  tags: string[]
  author: string
  /** 文章摘要 */
  description: string
  /** 字数（源码统计：汉字按字、西文按词，1 词折算 1 字；见 words.ts） */
  words: number
  /** 阅读时间（分钟，按 300 字/分钟估算） */
  readingTime: number
  /** 置顶权重，越大越靠前 */
  sticky: number
}

declare const data: Post[]
export { data }

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// 不渲染整篇文章（render: false）：dev 首次加载不用等全部文章渲染
// （含 KaTeX/shiki 约 9s）。字数由 markdown 源码按“汉字计字、西文计词”
// 统计（见 words.ts），dev 与 build 数字一致；excerpt 仍单独渲染用于摘要展示
export default createContentLoader('posts/**/*.md', {
  includeSrc: true,
  excerpt: true,
  render: false,
  transform(raw): Post[] {
    return raw
      .filter((p) => !p.frontmatter.draft)
      .map((p) => {
        const date = new Date(p.frontmatter.date || 0)
        const words = countWordsFromSource(p.src || '')
        const y = date.getFullYear()
        const m = String(date.getMonth() + 1).padStart(2, '0')
        const d = String(date.getDate()).padStart(2, '0')
        // vdoing 风格 frontmatter 用 categories 数组（也兼容单个 category 字段）
        const fmCats = p.frontmatter.categories
        const category = Array.isArray(fmCats)
          ? fmCats[0] || ''
          : typeof fmCats === 'string'
            ? fmCats
            : p.frontmatter.category
        return {
          title: p.frontmatter.title || p.url,
          // 文章 URL 与原站一致：用 frontmatter 的 permalink（/pages/xxxxxx/），
          // data loader 的 url 不应用 rewrites，需手动覆盖
          url: (p.frontmatter.permalink as string) || p.url,
          date,
          dateText: `${y}-${m}-${d}`,
          year: String(y),
          month: m,
          category: category || '未分类',
          tags: (p.frontmatter.tags as string[]) || [],
          author: p.frontmatter.author || SITE.author,
          description: p.frontmatter.description || (p.excerpt ? stripHtml(p.excerpt) : ''),
          words,
          readingTime: Math.max(1, Math.round(words / 300)),
          sticky: p.frontmatter.sticky || 0,
        }
      })
      .sort((a, b) => b.sticky - a.sticky || +b.date - +a.date)
  },
})

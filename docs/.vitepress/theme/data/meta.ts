import type { Post } from './posts.data'
import { CATEGORY_META, CATEGORY_ORDER, DEFAULT_CATEGORY_ICON, SITE, SOCIAL } from './constants'

export { CATEGORY_META, CATEGORY_ORDER, DEFAULT_CATEGORY_ICON, SITE, SOCIAL }

/** 展示用日期：2025年8月15日（数据加载器输出经 JSON 序列化后 date 可能是字符串） */
export function formatDateZh(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/**
 * 文章时间戳（毫秒）。
 * 构建时 date 是 Date，序列化到前端后变成 ISO 字符串；
 * 直接 `+date` 会得到 NaN，导致排序比较器静默失效。
 */
function postTimestamp(post: Post): number {
  const date: Date | string = post.date
  const time = typeof date === 'string' ? new Date(date).getTime() : date.getTime()
  return Number.isNaN(time) ? 0 : time
}

export interface CategoryInfo {
  name: string
  count: number
  icon: string
  desc: string
}

/** 分类排序：优先 CATEGORY_ORDER，未配置的按文章数降序、再按名称 */
export function compareCategory(a: string, b: string): number {
  const ia = CATEGORY_ORDER.indexOf(a)
  const ib = CATEGORY_ORDER.indexOf(b)
  if (ia !== -1 || ib !== -1) {
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  }
  return a.localeCompare(b, 'zh-CN')
}

/** 从文章列表统计分类信息（按配置顺序） */
export function collectCategories(posts: Post[]): CategoryInfo[] {
  const counts = new Map<string, number>()
  for (const p of posts) counts.set(p.category, (counts.get(p.category) || 0) + 1)
  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      icon: CATEGORY_META[name]?.icon || DEFAULT_CATEGORY_ICON,
      desc: CATEGORY_META[name]?.desc || '',
    }))
    .sort((a, b) => compareCategory(a.name, b.name))
}

/** 按年份（内按月）分组，返回有序数组 */
export function groupByYearMonth(
  posts: Post[],
): { year: string; months: { month: string; posts: Post[] }[] }[] {
  const yearMap = new Map<string, Map<string, Post[]>>()
  for (const p of posts) {
    if (!yearMap.has(p.year)) yearMap.set(p.year, new Map())
    const m = yearMap.get(p.year)!
    if (!m.has(p.month)) m.set(p.month, [])
    m.get(p.month)!.push(p)
  }
  return [...yearMap.entries()]
    .sort((a, b) => +b[0] - +a[0])
    .map(([year, monthMap]) => ({
      year,
      months: [...monthMap.entries()]
        .sort((a, b) => +b[0] - +a[0])
        .map(([month, monthPosts]) => ({
          month,
          // 前端拿到的 date 已序列化为字符串，必须显式转时间戳再比较
          posts: [...monthPosts].sort((a, b) => postTimestamp(b) - postTimestamp(a)),
        })),
    }))
}

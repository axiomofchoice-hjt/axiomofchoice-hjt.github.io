// 从 markdown 源码统计字数（dev/build 同源，数字一致）。口径：
//   1. 表意文字（汉字/假名/谚文）一字算 1 字；
//   2. 连续的字母/数字串算一个单词，1 个单词折算 1 字
//      （don't、a_b、__init__ 视为同一个词）；
//   3. 标点、符号、空白、Markdown 语法标记（#、**、|、--- 等）一律不计；
//      图片不产生文本、链接不计 URL、代码围栏行本身及语言标记（```cpp）不计。
// 代码块内部不特殊处理：其中的标识符/数字按上面的规则逐词计入。
//
// 不渲染全文：dev 首次加载不用等渲染全部文章（含 KaTeX/shiki 约 9s）。
// 注意：不能直接对源码做 <[^>]*> 标签剥离——代码里的 `<`（如 a < b）会
// 吞掉大段文本，因此这里完全不剥离 HTML 标签（源码中极少出现）。
const CJK_CHAR_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/g
const WORD_RE = /[\p{L}\p{N}]+(?:['’_][\p{L}\p{N}]+)*/gu

export const countWordsFromSource = (src: string): number => {
  let s = src
  // 去掉 frontmatter
  s = s.replace(/^---\n[\s\S]*?\n---\n?/, '')
  // 去掉 HTML 注释
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  // 去掉代码围栏行（```lang / ~~~）：围栏与语言标记不是正文
  s = s.replace(/^[ \t]*(?:`{3,}|~{3,})[^\n]*$/gm, ' ')
  // 图片整体去掉（渲染后不产生文本）
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  // 链接只保留文字（渲染后 URL 不计入）
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  // 先数表意文字，再从剩余文本里数单词：否则一串汉字会被 \p{L}+ 当成一个词
  const cjkChars = (s.match(CJK_CHAR_RE) || []).length
  const words = (s.replace(CJK_CHAR_RE, ' ').match(WORD_RE) || []).length
  return cjkChars + words
}

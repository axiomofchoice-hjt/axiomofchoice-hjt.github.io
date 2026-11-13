# Axiomofchoice's Blog

<https://axiomofchoice-hjt.github.io/>

一个退役败犬的个人博客（C++ / HPC / Algorithm），基于 [VitePress](https://vitepress.dev) 构建，
主题风格参考 [vuepress-theme-vdoing](https://vuepress-theme-vdoing-doc.vercel.app/)。

> 原站使用 VuePress 1.x + vdoing 主题，已整体迁移至 VitePress + 自研 vdoing 风格主题
> （数字目录前缀已移除，排序由日期与分类顺序配置取代）。

## 🚀 快速开始

```bash
npm install
npm run dev      # 开发预览 http://localhost:5173
npm run build    # 构建到 docs/.vitepress/dist
npm run preview  # 预览构建产物 http://localhost:4173
```

## 📁 目录结构

```text
docs/
├── index.md                 # 首页（layout: home，内容由主题插槽注入）
├── archives.md              # 归档页（按年/月）
├── categories.md            # 分类聚合页
├── tags.md                  # 标签聚合页
├── about.md                 # 关于页
├── posts/                   # 文章目录（一级目录 = 分类）
│   ├── C++/ 性能优化/ AI/ 算法/ 数学/ 杂谈/ 算法竞赛记录/ 败犬日报/ English/
└── .vitepress/
    ├── config.ts            # 站点配置（导航 / 搜索 / 侧边栏自动生成）
    └── theme/               # ★ 自研主题
        ├── index.ts         #   主题入口
        ├── Layout.vue       #   布局：插槽注入 首页 / 元信息 / 上一篇下一篇 / 侧栏
        ├── data/
        │   ├── constants.ts #   站点常量：博主信息、分类图标与顺序
        │   ├── posts.data.ts #  文章数据加载器（createContentLoader）
        │   └── meta.ts       #  分类 / 标签聚合、分组、展示元信息
        ├── components/       #   页面与区块组件
        └── styles/index.css  #   vdoing 风格样式（CSS 变量换肤）
└── .github/workflows/deploy.yml  # GitHub Pages 自动部署
```

## ✍️ 写作

在 `docs/posts/<分类>/` 下新建 Markdown 文件即可。frontmatter 兼容原 vdoing 格式
（`categories` 数组），示例：

```yaml
---
title: 文章标题
date: 2025-08-15 12:00:00   # 发布日期（决定归档排序）
categories:
  - C++                       # 分类
description: 文章摘要
---
```

- 数学公式：`$...$` / `$$...$$`（MathJax，内置支持）
- 图片：放在 `docs/posts/<分类>/assets/` 下，相对路径引用 `![](./assets/xxx.png)`
- 置顶：`sticky: 1`（仅首页置顶；分类页 / 归档页始终按发布日期倒序）；草稿：`draft: true`

## 🎨 定制主题

- **博主信息 / 社交链接**：`theme/data/constants.ts` 中的 `SITE` / `SOCIAL`
- **分类图标 / 描述 / 顺序**：`theme/data/constants.ts` 中的 `CATEGORY_META` / `CATEGORY_ORDER`
- **主色**：`theme/styles/index.css` 中的 `--vp-c-brand-*` 变量

## 📦 部署

推送 `main` 分支即触发 GitHub Actions 自动构建并部署到 GitHub Pages。

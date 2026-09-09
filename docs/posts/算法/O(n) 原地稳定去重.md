---
title: O(n) 原地稳定去重
date: 2026-07-04 00:06:57
permalink: /pages/1aa983/
categories:
  - 算法
description: 本文将 std::unique 升级为真正的 O(n) 原地稳定去重，利用分块策略与旋转技巧，在不占用额外内存的前提下保证相同元素原始顺序。同时剖析了多重集操作（交集、并集）遇到的理论与工程挑战。
---

![img](./assets/1aa983-0.webp)

依旧完善原地算法拼图。写了那么多期原地算法，C++ `<algorithm>` 只剩下了几个算法可以原地稳定改造，即去重和集合操作（交集并集等）。

这期重点讲去重算法。集合操作我还没想到优雅解法，暂时不实现了，如果哪天实现了就另外写个文章讲一下。

参考的论文是：

1. [Stable Duplicate-Key Extraction with Optimal Time and Space Bound](https://doi.org/10.1007/BF00289147)
2. [Stable set and multiset operations in optimal time and space](https://doi.org/10.1145/308386.308458)

## 1. 问题定义

给定一个升序数组，将数组划分为两个区间：“去重”区间，每个键出现的第一个元素；“重复”区间，剩下所有元素。同时要求 $O(n)$ 时间复杂度、原地（$O(1)$ 额外空间复杂度）、稳定（相同键的元素在算法前后顺序不变）。

这个算法类似 `std::unique` 但是有亿些不同。首先 `std::unique` 只保证“去重”区间，剩下元素处于未指定但有效，更谈不上稳定。另外 `std::unique` 只需要等于 `operator==`，而原地稳定去重需要支持所有比较运算。（但我还是把算法命名成 unique）

## 2. 前置算法

rotate（区间旋转），把两个相邻区间 `[A B]` 原地变成 `[B A]`，保持区间内部顺序不变。这里代码里直接调用标准库的 `std::rotate` 了。

## 3. O(n) 原地稳定去重

这是一个分块算法，我们定义块大小 $s=\lfloor \sqrt{n} \rfloor$。

为了方便讲解，定义 L1 为“去重”区间的元素，L2 为“重复”区间的元素。

### 3.1. 提取缓冲区

我们需要 s 个 L1 元素组成缓冲区，利用区间旋转算法很容易做到 $O(s^2+n)=O(n)$ 的复杂度。

1. 找第一个 L1 元素。
2. 找第二个 L1 元素，将第一个 L1 元素旋转到第二个前面。
3. 找第三个 L1 元素，将前两个 L1 元素旋转到第三个前面。
4. 依次类推。

最后把收集到的 L1 元素旋转到开头供后续使用。

```cpp
template <typename RandomIt, typename Proj = std::identity>
RandomIt stable_unique_limit(RandomIt first, RandomIt last, int64_t max, Proj proj = {}) {
    RandomIt left = first;
    RandomIt right = first;
    int64_t len = 0;
    for (RandomIt iter = first; iter < last; iter++) {
        if (len < max && (left == right || proj(*(right - 1)) != proj(*iter))) {
            std::ranges::rotate(left, right, iter);
            len++;
            right = iter + 1;
            left = right - len;
        }
    }
    std::ranges::rotate(first, left, right);
    return first + len;
}
```

如果 L1 元素不足 s 个，提取缓冲区之后就直接结束算法。

缓冲区对应的 L2 元素可以直接跳过，避免干扰后续流程。

### 3.2. 构建纯块

这是最关键的一步，目标是构建若干个大小为 s 的块，这些块要么全是 L1 元素，要么全是 L2 元素。剩下无法组成块的 L1 / L2 元素单独处理。

这个步骤需要缓冲区和 4 个指针配合完成。4 个指针表示两个区间，L1 工作区间和 L2 工作区间。

一开始，缓冲区在数组左边，L1 工作区间（空区间）在缓冲区左边，L2 工作区间（空区间）在缓冲区右边。

遍历数组的每个元素，判断它属于 L1 还是 L2。如果是 L1，把他和 L1 工作区间右边的元素交换（可以保证是缓冲区元素），L1 工作区间增长 1 个元素。L2 同理（可以保证是缓冲区元素或者和自己交换）。

如果 L1 或 L2 工作区间满了（大小为 s），拿出来作为纯块，按顺序排列纯块、L1 工作区间、缓冲区、L2 工作区间。如果是 L1 纯块，交换它的前两个元素用于标记来自 L1。

```cpp
template <typename RandomIt, typename Proj = std::identity>
std::tuple<RandomIt, RandomIt> build_blocks(
    RandomIt first, RandomIt last, int64_t block_size, Proj proj = {}) {
    using T = std::iter_value_t<RandomIt>;
    RandomIt uniq_start = first;
    RandomIt uniq_end = first;
    RandomIt dup_start = first + block_size;
    RandomIt dup_end = first + block_size;
    std::optional<T> prev_key;
    for (RandomIt it = first + block_size; it < last; it++) {
        if (!prev_key || proj(*prev_key) != proj(*it)) {
            prev_key = *it;
            std::swap(*uniq_end, *it);
            uniq_end++;
        } else {
            std::swap(*dup_end, *it);
            dup_end++;
        }
        if (uniq_end - uniq_start == block_size) {
            std::swap(uniq_start[0], uniq_start[1]);
            uniq_start = uniq_end;
            std::ranges::rotate(dup_start, dup_end, it + 1);
            dup_start += block_size;
            dup_end += block_size;
        }
        if (dup_end - dup_start == block_size) {
            std::ranges::rotate(uniq_start, dup_start, dup_end);
            uniq_start += block_size;
            uniq_end += block_size;
            dup_start = dup_end;
        }
    }
    std::ranges::rotate(uniq_end, dup_start, dup_end);
    std::ranges::rotate(first, last - block_size, last);
    return {uniq_start + block_size, uniq_end + block_size};
}
```

### 3.3. 划分纯块

目标是把这些纯块排列成 L1 纯块在左边，L2 纯块在右边。

看起来是个复杂的原地划分问题，但是 L1 纯块不需要保证稳定性，因为它的键有唯一性，在下一步可以用排序恢复顺序。根据这个特性，我们从右往左进行双指针划分算法。

判断 L1, L2 块就用上一步留下的线索（L1 的前两个元素被交换），在这一步完成后就复原。

```cpp
RandomIt partition_blocks(RandomIt first, RandomIt last, int64_t block_size, Proj proj = {}) {
    assert_or_throw((last - first) % block_size == 0);
    int64_t n_blocks = (last - first) / block_size;
    RandomIt mid = last;
    for (int64_t i = n_blocks - 1; i >= 0; i--) {
        if (proj(first[i * block_size]) > proj(first[(i * block_size) + 1])) {
            std::swap(first[(i * block_size)], first[(i * block_size) + 1]);
        } else {
            mid -= block_size;
            if (first + (i * block_size) != mid) {
                std::ranges::swap_ranges(first + (i * block_size), first + ((i + 1) * block_size),
                    mid, mid + block_size);
            }
        }
    }
    return mid;
}
```

### 3.4. 最后的处理

首先对 L1 块进行选择排序，缓冲区也用选择排序复原。然后用 rotate 把“构建纯块”的末尾元素归位，把“提取缓冲区”里缓冲区对应的 L2 元素归位。

## 4. 完整代码

[完整实现](https://github.com/axiomofchoice-hjt/TCS-Algorithms/blob/master/include/tcs/inplace/stable_unique.hpp)和[测试](https://github.com/axiomofchoice-hjt/TCS-Algorithms/blob/master/tests/inplace/test_stable_unique.cpp)。

## 5. 原地稳定集合操作

集合操作是把两个有序数组进行交集、并集、差集、对称差集操作，放到数组左边，剩下的元素按原来顺序放到数组右边。

### 5.1. SELECT 原语

论文给出了一个 SELECT 原语（其实就是交集），利用这个原语配合去重、归并就可以完成所有操作：

1. 交集：SELECT 即可。
2. 并集：归并，然后去重。
3. 差集：SELECT 取 SELECT 剩下的部分，rotate 到前面。
4. 对称差集：左右两边都 SELECT，并取剩下部分 rotate 到前面，归并一下。

看起来很清晰，麻烦的地方在下面。

### 5.2. 多重集

事实上论文还支持多重集操作，从集合操作推广到多重集就是：

1. 交集：两边相同键的个数取最小值。
2. 并集：最大值。
3. 差集：相减和 0 取最大值。
4. 对称差集：相减取绝对值。

（这是 C++ 标准库给的定义，论文没有用这个定义）

问题是，找不到一个合适的原语来处理所有操作。想要一起实现，就要传进来一个函数 `(int, int) -> int`，表示相同键的元素个数经过集合操作后，变为几个元素。这么万能的接口就注定内部实现非常复杂且不优雅。

论文的定义倒是能用一个 SELECT 原语支持所有操作，但是我想实现 C++ 标准库版。

### 5.3. 多重集算法

多重集算法和《O(n) 原地归并的稳定版本》非常相似，提取缓冲区、块排序、块合并、处理末尾元素。毕竟这算法就是归并的升级版。

具体就不赘述，什么时间我实现了算法，再来完整讲一遍。

## 6. 结尾

至此我们讲了归并、划分、选择、排序、去重、集合操作，这个 [github 仓库](https://github.com/axiomofchoice-hjt/TCS-Algorithms)开始像那么回事了。

文章没几个人看，万一哪天能拿来出面试题，也算是文章的微小贡献了 (doge)。

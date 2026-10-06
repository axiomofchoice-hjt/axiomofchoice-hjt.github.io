---
title: "位向量与 rank select"
date: 2026-10-04 17:02:49
permalink: /pages/6b2b47/
categories:
  - 算法
description: "位向量 rank/select 实现笔记：从四篇论文到 O(n) bit 额外空间的 C++ 实现，涵盖 Elias-Fano 编码、分块与分段查表。"
---

![img](./assets/6b2b47-0.webp)

来一期数据结构，在位向量 (Bit Vector) 上支持 rank select 操作。这一期我费了很多时间研究 4 篇论文，可是实现起来太复杂，最后还是选择了更弱的算法。

虽然只要把论文交给 AI 就可以快速实现，但还是算了，古法编程是我消遣娱乐的重要一环。

本期参考的论文是：

1. Succinct Static Data Structures（Jacobson 版）没有 DOI 号。开创了 Succinct 的概念，但是查询时间不是 $O(1)$。
2. Compact Pat Trees（Clark 版）也没有 DOI 号。rank 查询复杂度 $O(1)$，额外空间 $O(\frac{n\log\log n}{\log n})$，达到下界。select 查询复杂度 $O(1)$，额外空间 $O(\frac{n}{\log\log n})$，未达到下界。
3. [Succinct Indexable Dictionaries with Applications to Encoding k-ary Trees, Prefix Sums and Multisets](https://doi.org/10.1145/1290672.1290680)（RRR 版）。select 查询复杂度 $O(1)$，额外空间 $O(\frac{n\log\log n}{\log n})$，达到下界。
4. [Optimal lower bounds for rank and select indexes](https://doi.org/10.1016/j.tcs.2007.07.041)（Golynski 版）。证明了 rank select $\Omega(\frac{n\log\log n}{\log n})$ bit 的额外空间下界，并给出了 $\frac{n\log\log n}{\log n} + O(\frac{n}{\log n})$ bit 的算法。

接下来我们实现 $O(n)$ bit 的额外空间的位向量，顺便提一下论文是怎么做的。

## 1. 问题定义

位向量，是每个位置存储 0 或 1 的数组，在 C++ 里可以用 `std::bitset` 来存储。

rank，就是给定一个整数 $i$，求位向量前 $i$ 位有多少个 1。

select，就是给定一个整数 $k$，求位向量第 $k$ 个 1 的位置（假设“第 X 个”是从 0 开始计数）。

我们要实现一个位向量，支持 $O(1)$ 的 rank 和 select，并且额外空间复杂度 $O(n)$ bit。

## 2. 前置知识

### 2.1. Elias-Fano 编码

Elias-Fano 编码（下文简称 EF 编码）和位向量的关系非常紧密。

Elias-Fano 编码可以表示 $m$ 个严格递增的序列 $x_i$，值域是 $0$ 到 $U - 1$。

首先把整数拆成低位（$l=\lfloor \log \frac U m \rfloor$ 比特）和高位（剩余比特），低位原样存储，高位用一种长度为 $\lceil\frac{U}{2^l}\rceil+m$ 的位向量存储。令高位 $h_i=\lfloor \frac{x_i}{2^l}\rfloor$，$h_i+i$ 位置都是 1，其余都是 0。

想要取出第 k 个数，在高位位向量上查询 select(k)，减去 k 就是高位。低位直接读即可。

易得高位需要 $O(m)$ bit，低位需要 $O(m\log\frac{U}{m})$ bit。

## 3. rank

rank 操作非常简单，只要略微分块即可。

首先按块大小 $\frac{\log n}{2}$ 分块，用一个数组记录每一块首元素的 rank 值。数组每个位置 $\log n$ bit，数组大小 $\frac{2n}{\log n}$，因此需要 $O(n)$ bit。

同时预处理 popcount 表，把所有 $\sqrt n$ 以内的自然数 popcount 结果处理成表。popcount 运算就是求整数的二进制表示里有多少个 1。表的每个位置 $\log\log n$ bit，表大小 $\sqrt n$，因此需要 $O(\sqrt n\log\log n)$ bit。易得小于 $O(n)$ bit。

查询时，加载查询位置所在块的块首元素的 rank。然后从块首到查询位置（不超过 $\frac {\log n}{2}$ bit）加载为一个整数，查 popcount 表即可。

## 4. select

select 就很难了，我花了大量时间研究这玩意。

依旧分块的思路，不过这里换了个名词，叫分段。每 $\log n$ 个 1 为一段（不用考虑 0 属于哪一段，它们不是 select 的返回值），用一个数组记录每一段的起始位置。数组每个位置 $\log n$ bit，数组大小 $\frac{n}{\log n}$，因此需要 $O(n)$ bit。

第二个数组记录每一段的所有 1 的相对位置，并且尽可能压缩。一个思路是如果段的范围是 $R$，一个相对位置就用 $\log R$ bit 存储。

这个思路的问题是，考虑每一位都是 1，显然 $R=\log n$，因此每个 1 需要 $\log\log n$ bit 存储。最终就是 $O(n\log\log n)$ bit，超出预算了。

这就是本文最关键的问题，rank 用 popcount 表完成细粒度的查询，select 必然需要类似操作。

***

对于第二个数组，如果段的范围 $R$ 比较小，我们用 EF 编码进一步压缩。

具体来说，使用 $U=R,m=\log n$ 的 EF 编码。假设每段的范围都是 $R$，总空间是 $\frac n R O(m+m\log\frac{U}{m})$，代入得 $O(\frac{n\log n}{R}+\frac{n\log n}{R}\log \frac{R}{\log n})$。我们有 $R\ge \log n$，所以 $O(\frac{n\log n}{R}) \le O(n)$。令 $x=\frac{R}{\log n}$，显然 $x>\log x$，也就是 $\frac 1 x \log x<1$，即 $O(\frac{n\log n}{R}\log \frac{R}{\log n})\le O(n)$。

剩下的问题就是，EF 编码需要查询 select，而我们正在用 EF 编码解决 select 问题，这不是无限递归了吗。实则不然，这里的长度很短，可以用查表完成。

构建一个 $\sqrt n$ 行、每行 $\frac{\log n}{2}$ 个元素的二维表，可以查询 $\sqrt n$（$\frac{\log n}{2}$ bit）以内的整数，二进制表示的第 $k$ 个 1 的位置。表大小是 $\sqrt n \log n$，表的元素是 $\log \log n$ bit，因此需要空间是 $O(\sqrt n\log n\log \log n)$ bit。易得小于 $O(n)$ bit。

段的 EF 编码高位位向量是 $O(\log n)$ bit，一次 $\frac{\log n}{2}$ bit 查表不够，需要分多次查表。可以保证是常数次查表，因此查询复杂度还是 $O(1)$。

## 5. 实现

### 5.1. 位向量

首先要实现一个位向量，我们不仅需要位压缩，还要能一次操作读写连续的多个比特。很显然 `std::bitset, std::vector<bool>` 是做不到的。

直接位运算各种拼接，这里只展示读操作。

```cpp
struct BitVector {
    int64_t n_word_bits_ = 0;
    int64_t size_ = 0;
    std::vector<uint64_t> data_;

    // ...

    uint64_t get_range(int64_t l, int64_t r) const {
        assert_or_throw(l >= 0 && l <= r && r <= size_);
        assert_or_throw(r - l <= n_word_bits_);
        if (l == r) {
            return 0;
        }
        int64_t off = l % n_word_bits_;
        int64_t n_low = n_word_bits_ - off;
        int64_t len = r - l;
        uint64_t low = data_[l / n_word_bits_] >> off;
        if (len <= n_low) {
            return low & low_mask(len);
        }
        return (low & low_mask(n_low)) | (data_[r / n_word_bits_] & low_mask(len - n_low)) << n_low;
    }
};
```

### 5.2. PackedVector

基于位向量实现一个只存同一宽度的元素的 vector，一层很浅的封装。

```cpp
struct PackedVector {
    int64_t n_element_bits_ = 0;
    BitVector data_;

    // ...
};
```

### 5.3. rank

初始化需要构建 block_rank（块首元素的 rank 值）和 popcount 表。

```cpp
auto block_rank = PackedVector::create(n_index_bits, n_word_bits);
int64_t count = 0;
for (int64_t i = 0; i < size; i++) {
    bool value = data.get(i);
    if (i % n_block_bits == 0) {
        block_rank.push_back(count);
    }
    count += int64_t{value};
}
```

```cpp
auto popcount_table = PackedVector::create(logn, n_word_bits);
popcount_table.push_back(0);
for (int64_t i = 1; i < (int64_t{1} << n_block_bits); i++) {
    popcount_table.push_back(popcount_table.get(i >> 1) + (i & 1));
}
```

查询时，BitVector 区间读的整数，放到 popcount_table 里可以拿到块内 rank。再加上块首 rank。

```cpp
int64_t range =
    static_cast<int64_t>(data.get_range(index / n_block_bits_ * n_block_bits_, index));
return static_cast<int64_t>(
    block_rank_.get(index / n_block_bits_) + popcount_table.get(range));
```

### 5.4. select

用 compact 存储每一段段首位置、EF 编码。然后 `compact_offset` 存储 compact 每一段的开始位置，方便查找。

```cpp
PackedVector compact_offsets_;
BitVector compact_;
```

先写个循环遍历每个 1，把它们的索引临时保存到 segment 数组里：

```cpp
auto compact = BitVector::create(n_word_bits);
int64_t index = 0;
PackedVector segment = PackedVector::create(n_index_bits, n_word_bits);
for (int64_t i = 0; i < count; i++) {
    while (index < size && !data.get(index)) {
        index++;
    }
    segment.push_back(index);
    if ((i + 1) % n_ones_per_segment == 0 || i + 1 == count) {
        int64_t span =
            static_cast<int64_t>(segment.get(segment.size() - 1) - segment.get(0) + 1);
        // 记录 EF 编码
        segment = PackedVector::create(n_index_bits, n_word_bits);
    }
    index++;
}
```

EF 编码预处理，把每个 1 的相对位置拆成 high 和 low 两个部分，高位编码位向量，低位原样存储。

```cpp
int64_t n_span_bits = ceil_log2(span);
int64_t n_low_bits =
    ceil_log2((span + n_ones_per_segment - 1) / n_ones_per_segment);
int64_t high_len = (int64_t{1} << (n_span_bits - n_low_bits)) + segment.size();
compact.push_back_range(n_span_bits, n_index_bits);
compact.push_back_range(n_low_bits, n_index_bits);
for (int64_t j = 0; j < high_len; j++) {
    compact.push_back(false);
}
for (int64_t j = 0; j < segment.size(); j++) {
    int64_t value =
        static_cast<int64_t>(segment.get(j) - segment.get(0)) >> n_low_bits;
    compact.set(compact.size_ - high_len + j + value, true);
}
for (int64_t j = 0; j < segment.size(); j++) {
    int64_t value = static_cast<int64_t>(segment.get(j) - segment.get(0)) &
                    ((int64_t{1} << n_low_bits) - 1);
    compact.push_back_range(value, n_low_bits);
}
```

最后是预处理 select 表，用于稠密段 EF 编码的 select 查询。

```cpp
int64_t n_select_table_bits = std::max(logn / 2, int64_t{1});
auto select_table = PackedVector::create(ceil_log2(n_select_table_bits + 1), n_word_bits);
for (int64_t i = 0; i < (int64_t{1} << n_select_table_bits); i++) {
    int64_t k = 0;
    for (int64_t j = 0; j < n_select_table_bits; j++) {
        if (((i >> j) & 1) == 1) {
            select_table.push_back(j);
            k++;
        }
    }
    while (k < n_select_table_bits) {
        select_table.push_back(n_select_table_bits);
        k++;
    }
}
```

最后的查询 select，这代码有点复杂，不便展示，具体看仓库链接吧。

## 6. 完整代码

[完整实现](https://github.com/axiomofchoice-hjt/TCS-Algorithms/blob/master/include/tcs/ds/compact_bit_vector.hpp)和[测试](https://github.com/axiomofchoice-hjt/TCS-Algorithms/blob/master/tests/ds/test_compact_bit_vector.cpp)。

## 7. Succinct Bit Vector

Succinct Bit Vector 就是 4 篇参考论文讲的额外空间 $o(n)$ bit 的一些数据结构，因此本文实现的 $O(n)$ bit 不能算 Succinct。一开始我按照 Golynski 版来实现，但是 3 层分段 + 1 层分块的结构太难组织了，所以只能简化算法。另一方面也是让文章好懂一些。

Clark 版的 rank 是两层分块结构，和我实现的一层分块是相同原理，所以想要实现很容易（并且能达到空间复杂度下界）。

***

然后讲一下 Golynski 版 select 复杂在哪。

count index 是按 $\log n-3\log \log n$ 分块，块内 select 就是一个查表的过程。

第一级分段：每 $\log^2 n$ 个 1 一段，范围超过 $\log^4 n$ 是稀疏段，记录绝对位置；否则走第二级分块。

第二级分段：每 $\log n\log \log n$ 个 1 一段，范围超过 $(\log n\log\log n)^2$ 是稀疏段，记录相对位置；范围不超过 $\frac{\log^2n}{4\log\log n}$ 是稠密段，索引到 count index；否则走第三级分块。

第三级分块：每 $(\log\log n)^3$ 个 1 一段，范围超过 $\log n(\log\log n)^4$ 是稀疏段，记录相对位置；否则是稠密段，索引到 count index。

其中如何索引到 count index，是把多个数放进一个整数里批量操作，来决定选哪个 count index。具体就不细讲了，我都没理解。

## 8. rank select 的应用

论文也给了很多 rank select 的应用。

例如上文的 EF 编码需要用 select 来实现，这是个显然的结论。

还有二叉树的 succinct 表示。首先原二叉树的每个节点都是真实节点，真实节点如果没有左孩子，就补一个虚节点，右孩子也同理。将二叉树按层序遍历（即从上到下，从左往右），真实节点编码为 1，虚节点编码为 0。这样的话存储二叉树可以只用 2n bit 的位向量。

位向量的位置 i，如果它是真实节点，那么它的左孩子位于 2 rank(i)，右孩子位于 2 rank(i) + 1，父节点位于 select(i / 2)。（这里假设下标从 1 开始）

***

篇幅原因就不列举其他例子了。rank select 看起来冷门，但它在工程上的应用还是挺多的（只不过不一定 succinct）。

## 9. 结尾

断断续续写了几天代码才勉强写出来。目前看的论文都是很难实现的算法，不知道出下一期要多少时间了。

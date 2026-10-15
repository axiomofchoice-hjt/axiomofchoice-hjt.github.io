---
title: O(n) 原地选择的不稳定版本
date: 2026-05-10 17:30:55
permalink: /pages/63a6df/
categories:
  - 算法
description: 本文探讨了如何在 O(n) 时间复杂度和严格 O(1) 额外空间的原地限制下解决 top-k 选择问题。基于 1988 年论文 Implicit Selection，文章完整阐述了消除 BFPRT 算法递归栈的核心技术。
---

![img](./assets/63a6df-0.webp)

选择问题就是 topk 问题。众所周知 BFPRT（又叫 Median of Medians）已经能做到 $O(n)$ 选择，但是不算原地，多了 $O(\log n)$ 的递归栈。本文的重点就是如何消除递归栈。

这次参考的论文是 [Implicit Selection (1988)](https://doi.org/10.1007/3-540-19487-8_2)，它基于 BFPRT，将递归栈编码到数组和常数额外空间里。

原论文有很多精巧操作压低了比较和移动次数，也就是让常数变小。我只考虑了原地化改造，因此把算法简化很多，想还原的读者建议看原论文（以及后续更小常数的论文）。

## 1. 问题定义

给定一个数组 a 和一个整数 k，划分整个数组为前 k - 1 小的数、第 k 小的数、剩下的数，功能等价于 `std::nth_element`。同时限制 $O(n)$ 时间复杂度、原地（$O(1)$ 额外空间复杂度）。

算法选用的模型是最常用的 Word RAM。Word RAM 模型的存储单元是 Word，可容纳 w 比特，要求刚好能表示内存里每个存储单元的地址。一个 Word 能存储指针，但是存不了更多的信息。这个特性会在算法里用到。

## 2. 前置算法

### 2.1. 区间旋转

把两个相邻区间 `[A B]` 原地变成 `[B A]`，保持区间内部顺序不变。经典的做法是三次翻转法（或手摇算法），这里就不展开了。

代码里直接调用标准库的 `std::rotate`，复杂度 $O(n)$。

### 2.2. 划分

划分是将满足条件的一些元素排到前面。因为不需要保证稳定性，很容易想到双指针来完成。

```cpp
template <typename T, typename Pred>
void partition(T* first, T* last, Pred pred) {
    T* mid = first;
    for (T* iter = first; iter < last; iter++) {
        if (pred(*iter)) {
            std::swap(*mid, *iter);
            mid++;
        }
    }
}
```

后面代码直接调用标准库的 `std::partition`，复杂度 $O(n)$。

### 2.3. 快速选择算法

快速选择 (quickselect) 是随机选一个元素作为 pivot，将数组进行三路划分，划分为小于 pivot、等于 pivot、大于 pivot 的三个区间。如果 k 落在了第 1 或 3 个区间就递归。

这里的三路划分意图很明显，如果二路划分，中间是一个数来分割，元素都相同会导致复杂度退化成 $O(n^2)$。

```cpp
template <typename T>
void quickselect(T* first, T* mid, T* last) {
    static std::mt19937 gen(std::random_device{}());
    int64_t len = last - first;
    std::uniform_int_distribution<int64_t> dist(0, len - 1);
    T pivot = first[dist(gen)];
    T* pivot_start = std::partition(first, last, [pivot](T el) { return el < pivot; });
    T* pivot_end = std::partition(pivot_start, last, [pivot](T el) { return el == pivot; });
    if (mid < pivot_start) {
        quickselect(first, mid, pivot_start);
    } else if (mid >= pivot_end) {
        quickselect(pivot_end, mid, last);
    }
}
```

快速选择在每次选最小 / 最大的数时，会退化到 $O(n^2)$。实际上随机选数已经很好地避免了最坏情况，因此工程上也会以快速选择算法为主体，BFPRT 作为兜底。

### 2.4. BFPRT 算法

BFPRT 算法是快速选择 (quickselect) 算法的改进，保证了最坏复杂度 $O(n)$，当然常数也会大很多。

BFPRT 算法改进了选 pivot 的过程。我们每 5 个数一组，取组内的中位数，然后把这些中位数用递归 BFPRT 的方法再取中位数作为 pivot。

根据 pivot 将数组进行三路划分，划分为小于 pivot、等于 pivot、大于 pivot 的三个区间。如果 k 落在了第 1 或 3 个区间就递归 BFPRT。

证明一下复杂度。可以看到，一共有 n/5 个组，每个组的中位数都大于等于同一组的 3 个数。因此中位数的中位数大于等于 $n/5/2$ 个组乘以 3 也就是 $\frac{3}{10}n$ 个数。

算法时间函数 $T(n)$，获取中位数的中位数时间 $T(\frac{1}{5}n) + O(n)$，三路划分 $O(n)$，然后递归最坏情况是 $T(\frac{7}{10}n)$：

$$T(n)\le T(\frac{1}{5}n) + T(\frac{7}{10}n) + O(n)$$

接下来可以用归纳法，让 $T(0)\le b$，然后 $T(i)\le ai+b$ 对于 $0\le i<n$ 成立，证明 $T(n)\le an+b$ 成立。

总之因为 $\frac{1}{5}+\frac{7}{10}<1$，直觉上就大概能猜到 $O(n)$ 了。为什么要 5 个数一组的原因也就在这里，因为 3 个数一组 $\frac{1}{3}+\frac{2}{3}=1$，复杂度变为 $O(n\log n)$ 了。

```cpp
template <typename T>
void bfprt(T* first, T* mid, T* last) {
    assert_or_throw(first <= mid && mid < last);
    int64_t len = last - first;
    constexpr int64_t group_size = 5;
    if (len < group_size) {
        std::sort(first, last);
        return;
    }
    // median of medians of each group
    for (int64_t i = 0; i + group_size <= len; i += group_size) {
        std::sort(first + i, first + i + group_size);
        std::swap(first[i / group_size], first[i + group_size / 2]);
    }
    bfprt(first, first + len / group_size / 2, first + len / group_size);
    // three-way partition
    T pivot = first[len / group_size / 2];
    T* it1 = std::partition(first, last, [pivot](T el) { return el < pivot; });
    T* it2 = std::partition(it1, last, [pivot](T el) { return el == pivot; });
    // recurse
    if (mid < it1) {
        bfprt(first, mid, it1);
    } else if (mid >= it2) {
        bfprt(it2, mid, last);
    }
}
```

聪明的读者很快就发现，BFPRT 算法的递归栈有 $O(\log n)$ 额外空间复杂度，这显然不算真正的原地（工程上叫作原地没问题，但学术上要求更严格）。

那么如何消除递归栈呢？真正的算法才刚刚开始。

## 3. O(n) 原地选择的不稳定版本

这是个基于 BFPRT 的算法。

### 3.1. BitStack

BFPRT 的栈最大长度是 $O(\log n)$，如果一次只记录常数个比特，乘起来就是 $O(\log n)$ 比特。Word 至少 $O(\log n)$ 比特，那么就可以把栈压到常数个 Word 里。

在实现上，用 `std::bitset` 也问题不大，不过为了更符合 Word RAM 模型，我用 `std::array<uint64_t, N>` 实现了一下。

元素的比特数 element_bits 是常数，因此 push, pop 复杂度 $O(1)$。

```cpp
template <int64_t N>
struct BitStack {
    int64_t word_bits;
    int64_t element_bits;
    int64_t size = 0;
    std::array<uint64_t, N> storage = {};

    BitStack(int64_t word_bits, int64_t element_bits) : word_bits{word_bits}, element_bits{element_bits} {
        assert_or_throw(word_bits > 0 && word_bits <= int64_t{sizeof(uint64_t) * CHAR_BIT});
        assert_or_throw(element_bits > 0);
    }

    bool empty() const { return size == 0; }

    void push(uint64_t value) {
        assert_or_throw((size + 1) * element_bits <= N * word_bits);
        assert_or_throw(ceil_log2(value + 1) <= element_bits);
        for (int64_t i = 0; i < element_bits; i++) {
            int64_t bit_offset = size * element_bits + i;
            storage[bit_offset / word_bits] &= ~(uint64_t{1} << (bit_offset % word_bits));
            storage[bit_offset / word_bits] |= (value >> i & 1) << (bit_offset % word_bits);
        }
        size++;
    }

    uint64_t pop() {
        assert_or_throw(size > 0);
        size--;
        uint64_t res = 0;
        for (int64_t i = 0; i < element_bits; i++) {
            int64_t bit_offset = size * element_bits + i;
            res |= (storage[bit_offset / word_bits] >> (bit_offset % word_bits) & 1) << i;
        }
        return res;
    }
};
```

### 3.2. buffer 与编码

我们需要将一个整数编码到数组里。

数组里的两个不同的元素 x, y 可以拼成一个 bit，`x < y` 表示 0，`x > y` 表示 1，`std::swap(x, y)` 就能修改 bit。这样用 $\log n$ 对不同的元素就能编码一个整数。

那么怎么准备这样的一块编码的 buffer 呢？答案是改造摩尔投票算法。

摩尔投票算法是，一开始票数是 0。遍历每个元素，如果票数 0，这个元素成为候选者，票数 + 1；如果这个元素等于候选者，票数 + 1；否则票数 - 1。

摩尔投票时，如果票数 - 1，这意味着我们找到一对不同的元素（当前元素和候选者），把它们放入编码区。双指针维护正在被投票的元素的区间，区间左边是编码区，区间右边待处理。

如果众数太多，算法会失败，我们在后面存储 k 的失败分支会介绍。

复杂度 $O(n)$。

```cpp
template <typename T>
bool prepare_buffer(T* first, T* last, int64_t n_bits) {
    T* majority_ptr = first;
    for (T* iter = first; iter < last; iter++) {
        if (majority_ptr - first == n_bits * 2) {
            break;
        }
        if (majority_ptr < iter && *majority_ptr != *iter) {
            std::swap(*majority_ptr, *iter);
            majority_ptr += 2;
        }
    }
    return majority_ptr - first == n_bits * 2;
}

template <typename T>
bool write_buffer(T* buffer, uint64_t value, int64_t n_bits) {
    assert_or_throw(ceil_log2(value + 1) <= n_bits);

    for (int64_t i = 0; i < n_bits; i++) {
        assert_or_throw(buffer[i * 2] != buffer[i * 2 + 1]);
        if ((buffer[i * 2] > buffer[i * 2 + 1]) != (value >> i & 1)) {
            std::swap(buffer[i * 2], buffer[i * 2 + 1]);
        }
    }
    return true;
}

template <typename T>
uint64_t read_buffer(T* buffer, int64_t n_bits) {
    uint64_t res = 0;
    for (int64_t i = 0; i < n_bits; i++) {
        assert_or_throw(buffer[i * 2] != buffer[i * 2 + 1]);
        res |= (buffer[i * 2] > buffer[i * 2 + 1] ? uint64_t{1} : uint64_t{0}) << i;
    }
    return res;
}
```

### 3.3. 循环模拟递归

模拟递归就需要保存上下文，也就是中间变量。

BFPRT 的每个父问题会有两个子问题，一个是中位数的中位数（问题规模 1/5），另一个是划分后的尾递归（问题规模最大 7/10）。流程是阶段 1、1/5 子问题、阶段 2、7/10 子问题、阶段 3。

***

首先我们需要一个栈记录执行到阶段几。阶段 3 有两个不同的版本，分别是 BFPRT 算法里的 `mid < pivot_start` 和 `mid >= pivot_end`。所以实际上我们需要记录 4 个状态，2-bit。

BitStack 记录状态信息。因为 7/10 子问题的问题规模较大，考虑不断进行 7/10 子问题递归，$f(n)=\lfloor\frac{7}{10}n\rfloor$，深度不超过 $\log_{\frac{10}{7}}n=\frac{\log_2 n}{\log_2{\frac{10}{7}}}\approx 2\log_2 n$。再乘以 2-bit 就是 4 个 Word。

```cpp
BitStack<4> stages{word_bits, 2};
```

***

第二个是怎么恢复区间（就是 BFPRT 代码的 `T* first, T* last`）。我们遵循一个原则，父问题负责把全局状态改成子问题规模，子问题结束后也由父问题恢复全局状态。

首先把区间长度按 10 对齐，不被 10 整除的长度保存到 BitStack 里。这个余数有 0 到 9 一共 10 个状态，4 bit，深度不超过 $2\log_2 n$，一共 8 Word。

```cpp
BitStack<8> tail_sizes{word_bits, 4};
```

令 `aligned_len` 为按 10 对齐后的长度。

1/5 子问题前，保持 first 不变并把 last 向左移动 $\frac{4}{5}$ 倍 `aligned_len`。这样在 1/5 子问题后，只要 last 向右移动长度乘以 4 就能恢复 `aligned_len`。

7/10 子问题前，会有两种情况，区别就是 last 向左移动还是 first 向右移动。不管哪种，移动的长度都是 $\frac{3}{10}$ 倍 `aligned_len`。恢复时也同理，移动的长度是区间长度的 $\frac{3}{7}$ 倍。

最后 last 向右移动 tail_sizes 里保存的不对齐部分，恢复原始的区间。

***

第三个是怎么恢复 k，topk 的 k（就是 BFPRT 代码的 `mid - first` 的值）。

我们在阶段 1 的最后会准备编码 buffer 存储 k 的信息，在阶段 2 恢复 k。到阶段 3 时，7/10 子问题已经解决了父问题，因此阶段 3 不知道 k 也没关系。

需要注意的是，阶段 2 到阶段 3 不能通过 buffer 传递信息，因为准备 buffer 的失败分支复杂度太大，超出 $O(n)$ 了。

```cpp
BitStack<4> stages{word_bits, 2};
stages.push(Stage::median_of_medians);
while (!stages.empty()) {
    uint64_t stage = stages.pop();
    if (stage == Stage::median_of_medians) {
        // ...
    } else if (stage == Stage::partition) {
        // ...
    } else if (stage == Stage::restore_right) {
        // ...
    } else if (stage == Stage::restore_left) {
        // ...
    }
}
```

### 3.4. 对齐和尾部数据处理

上面讲到的对齐，只要把最大的 `tail_size` 个数排好序就行了。如果 k 落在了尾部，说明 topk 已经解决了，可以直接 continue 退出这个子问题。

`tail_size` 是常数，因此复杂度 $O(n)$。

```cpp
template <typename T>
void move_largest_to_end(T* first, T* mid, T* last) {
    int64_t right_size = last - mid;
    for (int64_t i = 0; i < right_size; i++) {
        std::swap(*std::max_element(first, last - i), *(last - i - 1));
    }
}
```

```cpp
move_largest_to_end(first, tail, last);
if (k >= aligned_len) {
    continue;
}
```

### 3.5. 存储 k 的失败分支

阶段 1 最后会准备 buffer 用于存储 k，如果失败了是什么情况？我们先看一下数组里有什么：$\frac 1 5 n$ 个中位数，$O(\log n)$ 的编码区，剩下都是众数。

由于这些中位数都是 5 个一组里挑出来的。如果中位数不是众数，那么这一组里至少 3 个元素不是众数，所以非众数中位数个数不超过非众数元素的 $\frac 1 3$。编码区不超过 $O(\log n)$ 个，因此中位数也不超过 $O(\log n)$ 个。

此时可以保证非众数元素数量是 $O(\log n)$。利用这个特性，先划分出非众数元素，再对它们暴力 $O(n^2)$ 排序，最后把众数旋转到对应位置，完成排序。这样 topk 解决了，可以直接 continue 退出这个子问题。

复杂度 $O(n+\log^2 n)=O(n)$

```cpp
T* buffer = first + aligned_len / group_size;
if (!prepare_buffer(buffer, tail, word_bits)) {
    T possible_majority = *(tail - 1);
    T* mid = std::partition(first, tail, [&](T x) { return x != possible_majority; });
    bubble_sort(first, mid);
    std::rotate(std::find_if(first, mid, [&](T x) { return x >= possible_majority; }), mid, tail);
    continue;
}
```

## 4. 完整代码

BFPRT [完整实现](https://github.com/axiomofchoice-hjt/TCS-Algorithms/blob/master/include/tcs/basic/bfprt.hpp)和[测试](https://github.com/axiomofchoice-hjt/TCS-Algorithms/blob/master/tests/basic/test_bfprt.cpp)。

原地不稳定选择 [完整实现](https://github.com/axiomofchoice-hjt/TCS-Algorithms/blob/master/include/tcs/inplace/unstable_select.hpp)和[测试](https://github.com/axiomofchoice-hjt/TCS-Algorithms/blob/master/tests/inplace/test_unstable_select.cpp)。

## 5. 结尾

这个算法算是原地选择算法的一个起点，后面不管是减小常数还是实现稳定版本，都有一定参考意义。

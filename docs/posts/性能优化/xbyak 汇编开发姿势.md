---
title: xbyak 汇编开发姿势
date: 2024-03-23 17:20:28
permalink: /pages/86fdbe/
categories:
  - 性能优化
description: 用 xbyak 库生成静态链接库
---

## 1. 前言

真正需要用汇编来开发的地方是很少的，我并不是让大家去写汇编，只是想分享技术而已。

本来是想分享点传统的汇编写法，但是一想到 C 宏、汇编宏交错在一起就令人头大，灵活性也不够满意。不如用（可能）更现代的汇编生成方式，即 C++ 配合汇编器 (assembler) 的方式。

汇编器我选择了 [xbyak 库](https://github.com/herumi/xbyak)。xbyak 本身是 JIT 汇编器，但这里我们只把 xbyak 当成静态的汇编器来使用。

## 2. 前置芝士

一点点链接基础、汇编基础。

## 3. 一个简单的例子

我们直接从例子出发，用汇编写两个简单的函数：

1. 函数直接返回一个 int 常量。
2. 两个 int 数组相加，结果放到第一个数组。

## 4. 写汇编

众所周知，汇编器只能把汇编翻译为机器码，所以要先写汇编。

我不太熟悉汇编。不过没关系，因为只是演示，我先写 C++ 代码，然后 gcc 帮我转换成汇编就行了（[结果在这](https://godbolt.org/z/a81TbPY5E)）。

首先打开 [godbolt](https://godbolt.org/)，然后输入想生成汇编的代码：

```cpp
int example() {
    return 114514;
}

void add(int *a, const int *b, int size) {
    for (int i = 0; i < size; i++) {
        a[i] += b[i];
    }
}
```

为了方便演示，这里用了 `-Og` 编译参数，编译器是 x86-64 gcc 13.2。

godbolt 告诉我如下的汇编代码：

```cpp
example():
        mov     eax, 114514
        ret
add(int*, int const*, int):
        mov     eax, 0
        jmp     .L3
.L4:
        movsx   rcx, eax
        mov     r8d, DWORD PTR [rsi+rcx*4]
        add     DWORD PTR [rdi+rcx*4], r8d
        add     eax, 1
.L3:
        cmp     eax, edx
        jl      .L4
        ret
```

## 5. 用 xbyak 实现

xbyak 写汇编非常直观：

```cpp
#include <xbyak/xbyak.h>

struct Example : Xbyak::CodeGenerator {
    Example() : Xbyak::CodeGenerator(1024, Xbyak::AutoGrow) {
        mov(eax, 114514);
        ret();
    }
};

struct Add : Xbyak::CodeGenerator {
    Add() : Xbyak::CodeGenerator(1024, Xbyak::AutoGrow) {
        mov(eax, 0);
        jmp(".L3");
        L(".L4");
        movsxd(rcx, eax);
        mov(r8d, dword[rsi + rcx * 4]);
        add(dword[rdi + rcx * 4], r8d);
        add(eax, 1);
        L(".L3");
        cmp(eax, edx);
        jl(".L4");
        ret();
    }
};
```

可以看到，汇编长啥样，xbyak 几乎就长啥样，非常直观。（有个不同点是汇编里的 movsx 要写成 movsxd，不然会抛异常，不知道为什么）

用下面的代码可以得到 uint8_t 的 vector，这就是函数里的所有指令了：

```cpp
std::vector<uint8_t> get_example_bytes() {
    Example code;
    code.ready();
    const uint8_t *bytes = code.getCode();
    return std::vector<uint8_t>(bytes, bytes + code.getSize());
}
// get_add_bytes 同理，略
```

其实到这里，我们写的汇编已经可以运行了，那就是用 xbyak JIT 方式（见 [xbyak 的说明](https://github.com/herumi/xbyak/blob/master/doc/usage.md)）。但这不是本文想要的最终结果。

## 6. 目标文件和头文件

参考 [xbyak 的例子](https://github.com/herumi/xbyak/blob/master/sample/bf.cpp)。

目标文件（可能是 .o 文件），我们可以用一个数组把二进制的指令给装起来，然后用 gcc 编译。但是因为这些二进制位于 .rodata 段，没有执行的权限，所以我们需要修改权限。

（name mangling 很麻烦，只好用 `extern "C"` 来解决）

```cpp
#include <sys/mman.h>
#include <unistd.h>

extern "C" __attribute__((aligned(4096))) const unsigned char example[] = {
    0xb8, 0x52, 0xbf, 0x01, 0x00, 0xc3,
};
extern "C" __attribute__((aligned(4096))) const unsigned char add[] = {
    0xb8, 0x00, 0x00, 0x00, 0x00, 0xeb, 0x0e, 0x48, 0x63,
    0xc8, 0x44, 0x8b, 0x04, 0x8e, 0x44, 0x01, 0x04, 0x8f,
    0x83, 0xc0, 0x01, 0x39, 0xd0, 0x7c, 0xee, 0xc3,
};

__attribute__((constructor)) static void codegen_init_() {
    long page_size = sysconf(_SC_PAGESIZE) - 1;
    mprotect((void*)example, (sizeof(example) + page_size) & ~page_size,
             PROT_READ | PROT_EXEC);
    mprotect((void*)add, (sizeof(add) + page_size) & ~page_size,
             PROT_READ | PROT_EXEC);
}
```

头文件用来注明函数的参数和返回值类型：

```cpp
#pragma once

extern "C" int example();
extern "C" void add(int *a, int *b, int size);
```

这些代码生成都可以自动化，我写了一个简单的示例：

```cpp
#include <xbyak/xbyak.h>

#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>

class CodeGen {
   private:
    struct Func {
        std::string name;
        std::string res;
        std::vector<std::string> args;
        std::vector<uint8_t> bytes;
    };

    std::vector<Func> functions;

   public:
    template <typename Code>
    void add(std::string name, std::string res, std::vector<std::string> args) {
        Code code;
        code.ready();
        const uint8_t *bytes = code.getCode();
        functions.push_back(
            {std::move(name), res, args,
             std::vector<uint8_t>(bytes, bytes + code.getSize())});
    }

    std::string gen_source() const {
        std::string code;
        code += "#include <sys/mman.h>\n";
        code += "#include <unistd.h>\n";
        code += "\n";
        for (auto &func : functions) {
            code +=
                "extern \"C\" __attribute__((aligned(4096))) const unsigned "
                "char " +
                func.name + "[] = {\n";
            for (size_t i = 0; i < func.bytes.size(); i++) {
                uint8_t byte = func.bytes[i];
                auto hex = [](uint8_t num) {
                    return char(num < 10 ? '0' + num : 'a' + num - 10);
                };
                code += std::string() + "0x" + hex(byte / 16) + hex(byte % 16) +
                        ",";
                if (i % 16 == 15 || i == func.bytes.size() - 1) {
                    code += "\n";
                }
            }
            code += "};\n";
        }
        code += "\n";
        code += "__attribute__((constructor)) static void codegen_init_() {\n";
        code += "    long page_size = sysconf(_SC_PAGESIZE) - 1;\n";
        for (auto &func : functions) {
            code += "    mprotect((void*)" + func.name + ", (sizeof(" +
                    func.name +
                    ") + page_size) & ~page_size, PROT_READ | PROT_EXEC);\n";
        }
        code += "}\n";
        return code;
    }

    std::string gen_header() const {
        std::string code;
        code += "#pragma once\n";
        code += "\n";
        for (auto &func : functions) {
            code += "extern \"C\" auto " + func.name + "(";
            auto &args = func.args;
            for (auto it = args.begin(); it != args.end(); ++it) {
                code += *it;
                if (std::next(it) != args.end()) {
                    code += ", ";
                }
            }
            code += ") -> " + func.res + ";\n";
        }
        return code;
    }
};

struct Example : Xbyak::CodeGenerator {
    Example() : Xbyak::CodeGenerator(1024, Xbyak::AutoGrow) {
        mov(eax, 114514);
        ret();
    }
};

struct Add : Xbyak::CodeGenerator {
    Add() : Xbyak::CodeGenerator(1024, Xbyak::AutoGrow) {
        mov(eax, 0);
        jmp(".L3");
        L(".L4");
        movsxd(rcx, eax);
        mov(r8d, dword[rsi + rcx * 4]);
        add(dword[rdi + rcx * 4], r8d);
        add(eax, 1);
        L(".L3");
        cmp(eax, edx);
        jl(".L4");
        ret();
    }
};

int main() {
    CodeGen codegen;
    codegen.add<Example>("example", "int", {});
    codegen.add<Add>("add", "void", {"int *", "int *", "int"});
    std::string source = codegen.gen_source();
    std::string header = codegen.gen_header();
    printf("%s", source.c_str());
    printf("***\n");
    printf("%s", header.c_str());
    return 0;
}
```

## 7. 与传统汇编开发的比较

说了这么多，那么 xbyak 的汇编开发方式究竟有啥好处呢？

众所周知，泛型（这里指参数多态）是一个很重要的语言特性，比如 C++ 的模板，可以对不同的类型 / 常量来生成不同的代码。

有同学可能要问了，汇编哪来的泛型？这就要弄清除一个概念，即泛型的本质就是代码生成 (codegen)。

汇编也是代码，我们可以用任意一个代码生成技术。比如 C 的宏、任意语言的字符串拼接、模板引擎（jinja2 等，甚至 autoconf），当然汇编本身也有宏。

这些技术（几乎）都是纯粹的文本拼接，可读性太差，用起来非常蹩脚。为什么 C++ 会用模板来代替部分 C 宏的功能，主要原因就是可读性。

同时，灵活性也是很棘手的问题。

举个例子，生成 N 条 `a++;` 或 `add eax, 1` 语句，N 是泛型指定的。C++ 模板可以轻易实现。C 的宏能实现吗？可以遍历 N 的值，一个致命的问题是代码非常难看。汇编宏同理。其他代码生成技术不是很优雅（主要是没人用）。

如果用 xbyak 就非常简单了，用 C++ 的 for 循环就行了：（N 通过构造函数参数传入）

```cpp
struct Example : Xbyak::CodeGenerator {
    Example(int N) : Xbyak::CodeGenerator(1024, Xbyak::AutoGrow) {
        for (int i = 0; i < N; i++) {
            add(eax, 1);
        }
        ret();
    }
};
```

C++ 和汇编混合的编程，这看起来非常神奇，又很合理。这不就是 JIT 灵活性的体现吗。

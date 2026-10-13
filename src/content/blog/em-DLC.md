---
pubDate: 2026-10-15
title: 【嵌入式学习/DLC】 可以停更吗，你的工程真的很难读😥 
description: 关于文件管理的DLC
author: shizuku
tags:
  - C文件管理
  - 工作
draft: true
---
文件管理应该是我的短板，一直以来我都是直接全部稀里糊涂的都堆在一个文件夹里面，如果内容少一点还好，但是东西稍微多一点简直就是灾难了。

gemini，*讲解下一个基本的c语言工程该如何建立正确的文件结构*：

>建立一个清晰、规范的 C 语言工程文件结构，是保证代码可维护性和可扩展性的核心。无论是小型练习还是大型项目，将源码、头文件、编译产物和第三方库分离是通用的最佳实践。
>以下是标准的 C 语言项目目录结构：
>```
>my_c_project/
├── bin/            # 存放最终生成的可执行文件 (Executable)
├── build/          # 存放编译时产生的中间文件 (.o 目标文件)
├── include/        # 存放项目所有的公共头文件 (.h)
├── src/            # 存放所有的源文件 (.c)
├── tests/          # 存放测试代码
├── lib/            # 存放第三方库或依赖 (Vendor/Third-party)
├── docs/           # 项目说明文档、API文档
├── .gitignore      # 配置 Git 忽略的文件 (如 bin/ 和 build/)
├── Makefile        # 构建脚本 (或者使用 CMakeLists.txt)
└── README.md       # 项目的总体说明
>```




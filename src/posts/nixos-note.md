---
layout: layouts/post.vto
title: NixOS 使用笔记
type: post
permalink: /posts/nixos-note/
description: 很长时间在使用 NixOS，这里留一些使用笔记，以后想起来的时候再补充
date: 2026-03-01
---

## 查询依赖树
运行时依赖树
```shell
nix-store -q --tree $(nix build nixpkgs#hello --print-out-paths --no-link)
```
构建时依赖树
```shell
nix-store -q --tree $(nix path-info --derivation nixpkgs#hello)
```
使用妙妙工具交互查询
```shell
nix run nixpkgs#nix-tree -- nixpkgs#hello
```

## 给 VPS 安装 NixOS

这里强调是在非挂载 NixOS ISO 的情况下

1. 先跑一个 alpine initramfs。
2. 在 alpine 里找到目标硬盘并分区。
3. 挂载目标系统到 /mnt 创建并启用 swapfile，避免低内存机器跑 Nix 时 oom。
4. 把 /mnt/nix bind 到 alpine 的 /nix。
5. 在 alpine 里安装 Nix，之后就是按照 NixOS offical manual。

现成项目：[bin456789/reinstall](https://github.com/bin456789/reinstall)

如果想要 btrfs subvol + disko 可以 fork 之后手动修改成想要的 disk layouts，其中 disko 可能在低内存机器上还是无法直接使用，这里可以使用这种思路

1. format、subvolume、mount、swapfile 仍由 alpine shell 手动完成。
2. partlabel 改成兼容 disko 的结构，如：disk-main-boot / disk-main-nixos。

也就是说：nixos-install 阶段不需要 disko，但磁盘 partlabel 和 layouts 向 disko 配置靠齐。

也可以用 [@lantian](https://lantian.pub/article/modify-computer/nixos-low-ram-vps.lantian/) 的思路，在 alpine initramfs 下直接 dd disk raw，只是我懒得在安装后扩展分区了。

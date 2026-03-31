---
title: LLM agent、Nix 与命令执行环境
pubDatetime: 2026-03-15
description: LLM agent 的命令能力越来越接近真实开发环境，容器只能限制它触碰宿主机的范围，Nix 能进一步管理工具来源、版本、依赖与临时状态。
tags: [llm-agent, nix]
---

最近在关注的一个 LLM agent：[Bub](https://github.com/PsiACE/bub) 有一个很有意思的内部命令模式。

以 `,` 开头的输入会进入 Bub runtime 的内部命令处理流程。已注册的命令会调用对应能力，未注册的命令会交给 bash 执行。这类命令并不需要先经过 LLM 理解和生成 tool call。

例如：
```shell
,rg -- "pattern" .
```
这更像是 operator 对 Bub runtime 发出的命令。Bub 所在的环境本身变成了一个很重要的命令执行环境。

这里值得记录的点不是怎样让 LLM agent 获得命令能力，需要考虑的是这个命令通道所在的环境该怎么管理。

## 普通容器的问题

Bub 可以跑在容器里。容器可以限制 Bub 能看到的目录，也可以把它和宿主系统隔开。这样至少不会让 Bub 运行在完整的日常用户环境里。

但如果容器内部仍然使用传统方式管理工具：
```shell
apt install ripgrep jq
pip install ...
npm install -g ...
cargo install ...
curl ... | sh
```
那么容器很快会变成一台小型 Linux 机器。

工具确实能装，命令确实能跑，但状态会堆起来：

**Docker 隔开了宿主机和容器，但容器内部的状态依然会变得混乱。**

这在 Bub 这种场景里会更明显。因为内部命令模式可以跳过模型调用，由 operator 让 Bub runtime 执行命令。这个入口越好用越容易把容器变成一个长期积累状态的环境。

## 预设置的 NixOS 容器

更合适的形态是构建一个预设置好的 NixOS 容器。
```nix
# modules/services/bub-agent-container.nix
{ config, lib, pkgs, ... }:

let
  imageName = "bub-nixos-agent";
  imageTag = "latest";

  bubImage = pkgs.dockerTools.streamLayeredImage {
    name = imageName;
    tag = imageTag;

    contents = with pkgs; [
      bashInteractive
      coreutils
      cacert
      curl
      git
      gnugrep
      gnused
      gnutar
      gzip
      nix
      bubPackage
    ];

    fakeRootCommands = ''
      ${pkgs.dockerTools.shadowSetup}

      groupadd -g 1000 bub
      useradd -u 1000 -g bub -m -d /home/bub -s /bin/bash bub

      mkdir -p /workspace
      mkdir -p /home/bub/.config/nix
      mkdir -p /nix/var/nix/profiles/per-user/root
      mkdir -p /nix/var/nix/gcroots/per-user/root
      mkdir -p /nix/var/nix/temproots
      mkdir -p /nix/var/nix/userpool

      cat > /home/bub/.config/nix/nix.conf <<'EOF'
      experimental-features = nix-command flakes
      sandbox = false
      EOF

      chown -R bub:bub /home/bub /workspace
    '';

    config = {
      Cmd = [ "/bin/bash" ];
      WorkingDir = "/workspace";

      Env = [
        "HOME=/home/bub"
        "USER=bub"
        "NIX_CONFIG=experimental-features = nix-command flakes\nsandbox = false"
        "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
        "GIT_SSL_CAINFO=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
      ];
    };
  };
in
{
  ... # 此处省略
}
```
这个容器预先包含：

- Nix
- Bub
- 基础用户
- 必要目录
- flakes / nix-command 配置

Bub 仍然跑在容器内部，内部命令模式仍然可以执行命令。区别在于命令需要的工具优先通过 Nix 获得。

例如：
```shell
,nix run nixpkgs#ripgrep -- "pattern" .
,nix run nixpkgs#jq -- '.version' package.json
,nix run nixpkgs#go -- test ./...
```
这样 Bub 仍然保持命令执行能力。工具来源交给 Nix 处理。版本可以由 nixpkgs revision 固定，依赖进入 Nix store，临时用过的内容后续也可以通过 GC 清理。

这和「容器里缺什么就用系统包管理器装什么」相比状态更清楚。

## 容器里的 Nix store

这个容器不需要挂载宿主机的 /nix，虽然这样会增加磁盘占用，但共用 nix store 会因为 nix daemon trusted user 带来安全性问题。

更合理的做法是让 Bub 容器有自己的 /nix/store。

这里不需要单独写 Dockerfile 或 docker-compose，镜像本身也可以放进 NixOS 配置里声明：

```nix
virtualisation.oci-containers.containers.bub = {
  image = "bub-nixos-agent:latest";
  imageStream = bubImage;

  workdir = "/workspace";
  user = "1000:1000";

  volumes = [
    "bub-workspace:/workspace"
    "bub-home:/home/bub"
    "bub-nix:/nix"
  ];
};
```
这里的状态归属是：

- bub-workspace 是 Bub 处理的项目目录
- bub-home 保存 Bub 自己的状态
- bub-nix 保存容器内 Nix 的状态

Bub 的运行环境属于容器。它通过 nix run 使用过的工具也属于这个容器自己的 Nix store。环境乱了可以在容器里执行：
```shell
nix store gc
```
也可以删除 bub-nix 这个 volume 后重新生成。

## 临时命令与项目环境

Bub 的内部命令模式适合临时操作。

例如临时搜索代码：
```shell
,nix run nixpkgs#fd -- src
```
临时检查 JSON：
```shell
,nix run nixpkgs#jq -- . package.json
```
如果某些工具变成项目长期需要的内容，可以写进项目的 flake.nix。

例如：
```nix
{
  description = "agent dev environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          git
          ripgrep
          fd
          jq
          go
        ];
      };
    };
}
```
之后 Bub 可以通过内部命令模式进入这个项目环境：
```shell
,nix develop -c go test ./...
,nix develop -c rg "TODO" .
```
这样临时使用的工具可以先停留在 nix run 阶段。长期需要的工具再写进 flake。Nix store 负责保存构建结果，也负责后续 GC。

## 此设计记录下来的状态

目前比较理想的形态大概是：

1. Agent 跑在容器里
2. 容器是预设置好的 NixOS 环境
3. 容器有自己的 /nix/store
4. 内部命令模式可以跳过 LLM 调用
5. operator 可以用 ,nix run ... 让 Agent runtime 执行命令
6. Agent 自己的状态单独保存
7. 临时依赖进入容器自己的 Nix store
8. 没有引用的 store path 交给 Nix GC
9. 环境损坏后可以删除 volume 重新生成

这套设计的目标不是为了让 Agent 获得更多权限。

目标是：**当 Agent 已经有了这个命令入口以后，它所在的执行环境需要足够清楚。**

普通容器可以隔开宿主机，但容器内部仍然可能堆出混乱状态，预设置的 NixOS 容器可以把工具获取、版本管理、依赖保存和清理交给 Nix。

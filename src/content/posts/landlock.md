---
title: 从 codex sandbox 实现到 linux landlock
pubDatetime: 2026-02-12
description: 最近在翻 codex-cli 的实现，翻到了不少好玩的东西，linux landlock 就是其中之一。
tags: [llm-agent, linux, rust]
---

> 更新：codex-cli 现在的 linux sandbox 实现切到了 bubblewrap，landlock 现在作为 legacy 实现。

虽然是 legacy，但这段实现仍然完整保留在 `linux-sandbox/src/landlock.rs` 里，这是理解 Landlock 的一个不错的样本：没有守护进程，没有命名空间，没有 setuid，只有一个线程对自己施加的、之后无法撤销的约束。

## 一段约束自身的代码

核心是一个函数：给当前线程装上文件系统规则，允许读取整盘，只允许写入 `/dev/null` 和调用方给定的 `writable_roots`。

```rust
fn install_filesystem_landlock_rules_on_current_thread(
    writable_roots: Vec<AbsolutePathBuf>,
) -> Result<()> {
    let abi = ABI::V5;
    let access_rw = AccessFs::from_all(abi);
    let access_ro = AccessFs::from_read(abi);

    let mut ruleset = Ruleset::default()
        .set_compatibility(CompatLevel::BestEffort)
        .handle_access(access_rw)?
        .create()?
        .add_rules(landlock::path_beneath_rules(&["/"], access_ro))?
        .add_rules(landlock::path_beneath_rules(&["/dev/null"], access_rw))?
        .set_no_new_privs(true);

    if !writable_roots.is_empty() {
        ruleset = ruleset.add_rules(landlock::path_beneath_rules(&writable_roots, access_rw))?;
    }

    let status = ruleset.restrict_self()?;

    if status.ruleset == landlock::RulesetStatus::NotEnforced {
        return Err(CodexErr::Sandbox(SandboxErr::LandlockRestrict));
    }

    Ok(())
}
```

## Landlock 是什么

Landlock 是一个从 5.13 引入的 Linux 安全模块（LSM），和 SELinux、AppArmor 同类，但方向是相反的：后两者由管理员配置全局策略，Landlock 可以让进程自己给自己加限制，不需要任何特权。它的目标是「restricting ambient rights」——收回进程凭 uid 默认就有的那些权限（读家目录、连网络、写临时目录），而且对它自己和它的子进程同时生效。

code agent 的场景正好用得上：执行命令前，先把可写的目录收紧到 workspace，而且需要不可逆、能被子进程继承。

## handle_access：先声明要管什么

Landlock 的模型分两步：

1. **handled**：用 `handled_access_fs` 声明规则要管理哪些访问权（`AccessFs::from_all` 拼的就是这组 `LANDLOCK_ACCESS_FS_*` 位标志）。
2. **allowed**：再用 `add_rules` 为具体路径授权其中一部分。

被 handle 没被任何规则授予的访问权，就是拒绝。即 handle 划定拒绝边界，add_rules 在边界内开洞。

所以这里 `handle_access(access_rw)` 把读和写全部纳入管辖，再逐条放开：对 `/` 授读（`path_beneath_rules` 作用于子树，于是全盘可读）、对 `/dev/null` 授读写、对每个 `writable_roots` 授读写。最后就是全盘可读，只有工作区和 `/dev/null` 可写。

这里 `handled_access_fs` 必须显式列出，是为了向后兼容：否则内核新增访问权后，旧程序的策略会在升级后变严格。

## ABI 与 best-effort

Landlock 的能力会随内核版本号增加而递进，用 ABI 版本号标识：ABI 1 是基础文件系统访问权，2 加 `REFER`（跨目录 link/rename），3 加 `TRUNCATE`，4 加网络（TCP bind/connect），5 加 `IOCTL_DEV`。

二进制可能跑在任意内核上。代码按 `ABI::V5` 描述意图，再用 `CompatLevel::BestEffort` 兜底：内核更低时，crate 自动剔除超范围的访问权，而不是整体失败。代价是策略可能比预期宽松（老内核没有 `TRUNCATE`，那一位就不管辖）。

就是因为允许降级，结尾对 `RulesetStatus::NotEnforced` 的检查才重要：降级可以接受，但「完全没生效」（内核没编译 Landlock）必须作为错误，不然等于裸奔。

## no_new_privs：施加约束的前提

`restrict_self` 之前必须先 `PR_SET_NO_NEW_PRIVS`。否则被限制的进程仍能 `exec` 一个 SUID 二进制提权、跳出沙箱。这个位保证「exec 不带来新特权」，一旦设置也不可撤销，方向和 Landlock 一致。

codex 在外层（`apply_permission_profile_to_current_thread`）只在确实需要 seccomp 或 Landlock 写限制时才设它——因为 `no_new_privs` 会同时禁掉 setuid，有些部署依赖它，不能无条件打开。

## restrict_self：不可撤销、可叠加、按线程

`ruleset.restrict_self()` 把规则集真正施加到当前线程，有三条语义：

- **不可撤销**：landlock 之后没有「解除沙箱」，只能继续加严。
- **可叠加**：每次叠一层（最多 16 层，超出 `E2BIG`），放行要求所有层都放行——取交集，只会越叠越严。
- **按线程，沿 clone 继承**：只对当前线程及之后 clone 出的子进程生效，不自动同步到兄弟线程。

## 几个缺点

- **依赖较新内核，且静默降级。** ABI 1 从 Linux 5.13 起，还要内核编进 `CONFIG_SECURITY_LANDLOCK` 并在 `lsm=` 启用。配合 best-effort，内核不支持的约束会被悄悄剔除，程序照跑但防护比你以为的弱。要硬性保证就得自己查 ABI。
- **只管文件系统和一部分网络。** `ptrace`、`io_uring`、信号、namespace、挂载、`/proc` 都不在语义里，网络也只到 TCP bind/connect。所以它从不能单独构成沙箱——codex 用 seccomp 补，`io_uring` 这类能绕过路径检查的异步接口直接在 seccomp 里禁掉。
- **无法管理已打开的 fd。** 检查发生在 open 那一刻，`restrict_self` 之前持有的可写 fd 之后照样能写。所以顺序必须是「先收紧再干活」，codex 的 `restrict_self` 紧接 `execvp` 就是为此。
- **按线程，多线程易漏。** ABI 8 前没有 TSYNC，得保证每个相关线程都被约束，或像 codex 那样在单线程、exec 前的位置施加。
- **不可撤销 + 16 层上限。** 长生命周期进程无法临时放权再收回。
- **基于路径拓扑，不基于内容。** 「限制读」就很麻烦——这段代码遇到收紧读权限的策略直接返回 `UnsupportedOperation`，因为得把「对 `/` 授读」翻成逐一枚举可读子树，还要处理嵌套区域、符号链接、不存在的路径。
- **违规难区分。** 拒绝时只返回 `EACCES` / `EPERM`，和普通权限错误混在一起；审计支持是 6.x 才补的。
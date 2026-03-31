---
title: Agent with a11y
pubDatetime: 2026-04-30
description: 让自己写的 LLM Agent 通过 a11y 操作桌面应用：一次小规模尝试
tags: [llm-agent, golang]
---
这个点子一开始是在 Twitter 上看到 alma 的作者 @yetone 看到的，对此我挺感兴趣的，于是我也尝试了一下，这篇文章只记录一个初步思路。

相比截图识别，在 a11y 下，LLM Agent 看到的对象是结构化的，桌面下的 Electron 应用对 a11y 支持非常出色。

## 一个最小模型
```go
type Node struct {
	ID       string   `json:"id"`
	Role     string   `json:"role"`
	Name     string   `json:"name"`
	Value    string   `json:"value,omitempty"`
	Enabled  bool     `json:"enabled"`
	Focused  bool     `json:"focused"`
	Actions  []string `json:"actions,omitempty"`
	Children []Node   `json:"children,omitempty"`
}

type Action struct {
	Type   string `json:"type"`
	NodeID string `json:"node_id,omitempty"`
	Text   string `json:"text,omitempty"`
}

type A11yDriver interface {
	Snapshot() (Node, error)
	Do(action Action) error
}
```
这里的 Snapshot 用来拿到当前界面的 a11y tree。

Do 用来执行动作。

```go
Action{
	Type:   "input",
	NodeID: "message-box",
	Text:   "hello",
}
```
## 把 UI 树交给模型

LLM Agent 需要看到当前 UI 的可理解描述。最简单的方式是把树转成文本。

```go
func RenderTree(n Node, depth int) string {
	indent := strings.Repeat("  ", depth)

	line := fmt.Sprintf(
		"%s- id=%s role=%s name=%q value=%q enabled=%v focused=%v actions=%v\n",
		indent,
		n.ID,
		n.Role,
		n.Name,
		n.Value,
		n.Enabled,
		n.Focused,
		n.Actions,
	)

	for _, child := range n.Children {
		line += RenderTree(child, depth+1)
	}

	return line
}
```
得到的内容可能类似这样：
```txt
- id=root role=window name="Chat" value="" enabled=true focused=false actions=[]
  - id=input-1 role=textbox name="Message" value="" enabled=true focused=true actions=[input]
  - id=button-1 role=button name="Send" value="" enabled=true focused=false actions=[press]
```
然后把它放进 prompt：
```go
func BuildPrompt(goal string, treeText string) string {
	return fmt.Sprintf(`You are controlling a desktop app through accessibility APIs.

Goal:
%s

Current accessibility tree:
%s

Return exactly one JSON action.
Allowed action types:
- press
- input
- wait

JSON schema:
{
  "type": "press | input | wait",
  "node_id": "target node id",
  "text": "text for input action"
}
`, goal, treeText)
}
```
## Agent 循环

一个最小循环可以写成这样：
```go
type LLMClient interface {
	Complete(prompt string) (string, error)
}

type Agent struct {
	Driver A11yDriver
	LLM    LLMClient
}

func (a *Agent) Run(goal string, maxSteps int) error {
	for step := 0; step < maxSteps; step++ {
		root, err := a.Driver.Snapshot()
		if err != nil {
			return err
		}

		treeText := RenderTree(root, 0)
		prompt := BuildPrompt(goal, treeText)

		raw, err := a.LLM.Complete(prompt)
		if err != nil {
			return err
		}

		var action Action
		if err := json.Unmarshal([]byte(raw), &action); err != nil {
			return fmt.Errorf("invalid action json: %w\nraw: %s", err, raw)
		}

		if action.Type == "wait" {
			time.Sleep(time.Second)
			continue
		}

		if err := a.Driver.Do(action); err != nil {
			return err
		}
	}

	return nil
}
```

这段代码没有处理复杂状态，也没有加入记忆、回退、历史动作分析。它只是表达一个最小闭环：`观察 UI → 让模型选择动作 → 执行动作 → 再观察 UI`
## 一个简化版 Driver

真实的 a11y driver 会和系统 API 打交道。macOS 有 Accessibility API，Windows 有 UI Automation，Linux 桌面环境通常可以看 AT-SPI。

这里先写一个假的 driver，真实实现里，MockDriver 会替换成系统级 a11y driver。

```go
type MockDriver struct {
	Tree Node
}

func (d *MockDriver) Snapshot() (Node, error) {
	return d.Tree, nil
}

func (d *MockDriver) Do(action Action) error {
	switch action.Type {
	case "press":
		fmt.Printf("press node: %s\n", action.NodeID)
	case "input":
		fmt.Printf("input node: %s text: %q\n", action.NodeID, action.Text)
	default:
		return fmt.Errorf("unknown action type: %s", action.Type)
	}

	return nil
}
```
主函数：
```go
func main() {
	driver := &MockDriver{
		Tree: Node{
			ID:      "root",
			Role:    "window",
			Name:    "Chat",
			Enabled: true,
			Children: []Node{
				{
					ID:      "input-1",
					Role:    "textbox",
					Name:    "Message",
					Enabled: true,
					Focused: true,
					Actions: []string{"input"},
				},
				{
					ID:      "button-1",
					Role:    "button",
					Name:    "Send",
					Enabled: true,
					Actions: []string{"press"},
				},
			},
		},
	}

	agent := &Agent{
		Driver: driver,
		LLM:    MockLLM{},
	}

	if err := agent.Run("Send a greeting message.", 3); err != nil {
		panic(err)
	}
}
```
输出结果类似：
```txt
input node: input-1 text: "hello from agent"
```
## 其他注意点

- 完整 a11y tree 可能很大，实际传给模型前，可以只保留与任务目标相近的节点，这样能减少噪声，也能降低模型误判概率。
- Agent 执行动作以后，UI 可能会变化，每一步都重新拿 snapshot，比假设页面状态稳定更可靠。
- 在复杂的交互场景中，模型需要维持一个短期的历史动作上下文，在内存中构建一个状态机或动作图谱可能是一个有效的做法。
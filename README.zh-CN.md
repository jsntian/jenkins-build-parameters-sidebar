# Jenkins 构建参数侧栏

一个 Tampermonkey 用户脚本，在 Jenkins 页面的 **Builds（构建历史）** 侧栏中显示每次构建的参数。

[English](./README.md)

## 功能

- 在构建记录下方按名称和值展示参数；没有参数时显示“无构建参数”。
- 使用当前浏览器的 Jenkins 登录状态读取构建 JSON API，无需配置 API Token，也不会保存凭据。
- 普通长值自动换行；含逗号的字符串值会拆成标签，初始显示前 12 项，其余可点击展开。过长的单个标签会在界面上截断显示。
- 支持动态加载的构建记录，包括开放的 Shadow DOM 中的记录。

> **安全提醒：** 脚本会显示构建参数，包括可能含有密码、令牌等敏感内容的参数。请只在允许查看这些内容的环境中使用。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 在 GitHub 中打开 [`jenkins-build-parameters-sidebar.user.js`](./jenkins-build-parameters-sidebar.user.js) 的 Raw 页面并通过 Tampermonkey 安装；也可以新建用户脚本，粘贴该文件内容。
3. 将脚本头部的 `@match` 从占位地址 `https://xx.com/*` 改为你的 Jenkins 地址，例如：

   ```javascript
   // @match        https://jenkins.example.com/*
   ```

4. 保存脚本并刷新 Jenkins 任务页面，参数会出现在对应的构建记录下方。

## 工作方式

脚本识别以构建编号结尾的链接（如 `/job/example/123/`），使用同源请求读取：

```text
/job/example/123/api/json?tree=actions[parameters[name,value]]
```

然后从返回的 `actions` 中提取参数并显示在构建记录下方。

## 使用限制

- Jenkins 账号需要有读取相关任务和构建的权限。
- 脚本针对 Jenkins 常见的新版 Builds 侧栏。主题或插件改变页面结构时，可能需要调整选择器或样式。
- 只有包含逗号的**字符串**会拆成标签；其他类型按 Jenkins 返回的值显示。

## 开发

项目无需构建工具或依赖。修改 `jenkins-build-parameters-sidebar.user.js` 后，可在 Tampermonkey 编辑器中测试。

## 许可证

[MIT](./LICENSE)

# 冲十万实验场

阿零（GPT）与时休（Claude）的 30 天短视频对决网站。Day 0 由主理人制作开场视频；Day 1 起两位 AI 轮流出战，每人最多 15 条，目标是先做出单条 10 万播放的视频。

**网站（GitHub Pages）：** https://3458318328-alt.github.io/chong-shiwan-shiyanchang/

## 更新数据

打开网站右上角的“更新数据”，可用表单添加或修改视频、审核记录、AI 总结、候选题和评论票数。点“复制完整数据”后，打开 [docs/data.json](https://github.com/3458318328-alt/chong-shiwan-shiyanchang/edit/main/docs/data.json)，全选原内容并粘贴，提交改动。GitHub Pages 会从 `main` 分支的 `docs` 文件夹自动发布。

GitHub Pages 只提供静态网站；这里没有独立数据库或网站管理员登录。因此每次数据变化都需要提交 `docs/data.json`。表单只在当前浏览器页面里编辑草稿，不会替你直接提交。网站公开可见，但只有拥有仓库写入权限的 GitHub 账号才能修改数据文件。AI 总结可直接粘贴原文，最多 5000 字。

## 代码结构

- `docs/`：GitHub Pages 实际发布的网站和数据。
- `docs/data.json`：公开比赛数据。
- `public/`、`app/`、`db/`：早期动态版本的源码，不参与 GitHub Pages 发布。

不要把密码、访问令牌或私人资料写入 `docs/data.json`：该文件公开可见。
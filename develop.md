# 开发者注意事项(Developer Notes)

> 本文档记录 n8n-nodes-17track 开发与发版过程中的关键约定与踩坑记录。
> 新贡献者必读;改 CI / 发版流程前先通读。

## 1. 环境要求

| 工具 | 版本 | 说明 |
|---|---|---|
| Node.js | **20 或 22** | CI 用 22(pnpm 11 要求 ≥22.13);Node 24 会被 n8n 运行时拒绝 |
| pnpm | 11.x | `packageManager` 字段锁定;pnpm 11 依赖 node:sqlite,Node 20 下本地跑不了(用 Node 22 跑 pnpm 命令) |
| npm | 仅用于发布后的安装验证 | 不作为包管理器 |

**注意**:`nvm use` 切换全局 Node 后,当前 shell 需 `hash -r` 刷新;CI 的 Node 版本由 release.yml 的 `actions/setup-node` 控制,与本地无关。

## 2. 构建

```bash
pnpm install          # 生成/校验 pnpm-lock.yaml
pnpm run build        # tsc -p tsconfig.json + node scripts/copy-assets.js
```

- **不要用 @n8n/node-cli 构建**:它的依赖树会拉进 `@n8n/expression-runtime → isolated-vm`(原生编译),在 CI 上必挂(历史上连续 3 次 Release 失败的元凶)。纯 `tsc` 就够了。
- **svg 图标必须手动复制**:`tsc` 不会拷贝非 TS 资源,`scripts/copy-assets.js` 负责把
  `nodes/SeventeenTrack/seventeenTrack.svg`、`seventeenTrack.dark.svg`、`credentials/seventeenTrackApi.svg`
  复制进 `dist/`。**新增图标后忘记跑 copy-assets,面板图标就是破图。**
- credential 的 `icon` 字段只接受字符串(`'file:xxx.svg' as const`);只有 **节点** 的 icon 支持 `{light, dark}` 对象。

## 3. 凭证与认证(最大的坑)

- **程序式节点(programmatic)必须显式调用 `await this.getCredentials('seventeenTrackApi')`**——
  否则 n8n 不会把凭证的 `authenticate`(generic/headers)注入到 `helpers.httpRequest` 请求里,
  所有请求都会 401。这是本项目历史上最大的坑(mock 测试手动注入 header 掩盖了它)。
- 认证采用**显式 header**:execute 里取 `credentials.apiKey` 后直接设置 `17token` 头,
  不依赖 n8n 的 generic-auth 自动注入(双保险)。
- `credentials.apiKey` 对应环境测试:凭证保存时 n8n 会按 credential 的 `test` 块发起连通性校验。

## 4. 沙箱与正式环境

- 代码内**唯一默认值**是正式环境:`https://api.17track.net/track/v2.4`(见 `nodes/SeventeenTrack/SeventeenTrack.node.ts` 的 `API_BASE`)。
- 沙箱测试通过环境变量注入,**绝不写入代码**:
  ```bash
  SEVENTEEN_TRACK_API_BASE="https://test-api-1.17track.net/track/v2.4"
  SEVENTEEN_TRACK_API_KEY="<sandbox key>"
  ```
- API key 一律走环境变量/凭证,**任何 key 都不允许提交进仓库**(含 README、截图、日志)。

## 5. 17TRACK 业务规则(错误码速查)

| 码 | 含义 | 处理 |
|---|---|---|
| `-18019901` | 单号已注册,无需重复注册 | 正常,跳过即可 |
| `-18019902` | 单号未注册,请先注册 | **先调 register_trackings 再查详情** |
| `-18019905` | retrack 每个单号只能一次 | 业务规则,正常 |
| `-18019909` | 暂无轨迹信息 | 单号刚注册,稍后再查 |
| `-18019804` | 新旧承运商相同 | 业务规则,正常 |
| `-18010204` | 账号未配置 webhook | push 前先配置 |
| `-18019912` | 实时查询接口未授权 | 需在 17TRACK 后台开通(付费能力) |
| `-18010001/02/04/05` | 认证失败 | 检查 17token |
| `-18019907/08` | 限流 | 退避重试 |
| `-18010003/-18019815~17` | 上游错误 | 稍后重试 |

行为规则:details 只查**已注册**单号;retrack 一次性;change-carrier 每单 5 次;批量上限 40。

## 6. CI / 发版(Semantic Release)

- **发版全自动**:`push main` → 分析提交 → 定版本 → CHANGELOG → npm publish(带 provenance)→ tag → GitHub Release。
- **提交信息必须遵循 Conventional Commits**(`feat:` / `fix:` / `docs:` / `chore:`)——`feat`/`fix` 触发发版,`docs`/`chore` 不触发。
- `pnpm-lock.yaml` **必须提交**(CI 用 `pnpm install --frozen-lockfile`);**不要加进 .gitignore**(踩过:lock 被忽略后 CI 装不上 semantic-release)。
- CI 安装用 `pnpm install --frozen-lockfile`;**不要加 --ignore-scripts**(依赖树已无原生模块,不需要了;那是 node-cli 时代的 hack)。
- git push 认证:semantic-release 用内置 `GITHUB_TOKEN`(release.yml 已声明 `contents: write`)。
  仓库 **Settings → Actions → General → Workflow permissions 必须是 "Read and write"**——
  被设为 read 时内置 token 推送必挂(报 Invalid username or token),且这是仓库级设置,改 workflow 文件无效。
- NPM_TOKEN 用 **Automation 类型**(绕过 npm 2FA;Publish 类型在 2FA auth-and-writes 模式下会报 EOTP)。
- scoped 包发布:`publishConfig.access: public` 已配置,勿删。

## 7. 版本与 tag

- 发版 tag 由 semantic-release 自动创建,**不要手工打 tag**(会与自动发版冲突:tag already exists)。
- 手工误打的 tag 用 `git push origin :refs/tags/<tag>` 删除远端后即可重新发版。

## 8. 测试

- mock-harness:直接实例化节点类、mock `IExecuteFunctions`、真实调沙箱(见主仓库 `.tools/n8n-e2e/` 思路)。
- 全量 e2e:按官方 11 端点逐个走通,注意**每次跑完恢复测试账号状态**(注册过的删掉/恢复)。
- 测试单号(沙箱):`4PX3003131010785CN` `4PX3003130266473CN` `UL447201805YP` `VR958617555YP`。
- 证据记录:`docs/e2e-evidence.md`(主仓库)。

## 9. 官方文档索引

- 17TRACK Tracking API v2.4(11 端点): https://asset.17track.net/api/document/v2.4_zh/index.html
- API Key 管理: https://api.17track.net/admin/settings
- Dify 插件 output_schema 规范: https://docs.dify.ai/en/develop-plugin/features-and-specs/plugin-types/tool
- 参考实现(领域对齐来源): https://github.com/oomol-lab/open-connector

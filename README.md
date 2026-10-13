# 神速 · GODSPEED

第三人称 3D 惯性竞速原型。选赫尔墨斯、哪吒或灯神，在浮空神殿、风火廊桥和灯廊捷径中，借坡道加速、磨轨、跳跃和角色技能挑战自己的最快一圈。

项目自有代码采用 MIT。当前游戏素材由维护者确认可商业使用和分发，具体范围与第三方条款见 [ASSETS.md](ASSETS.md)。本公开仓库不包含私人部署配置、账户记录、数据库或原私有 Git 历史。

## 游戏画面

下图来自当前版本实际运行的浏览器画面，分辨率 1440 × 900，展示当前发布版本的同一套游戏素材。

![首页：角色与赛道选择](docs/screenshots/home.jpg)

![实机：赫尔墨斯在神使坡道疾冲](docs/screenshots/gameplay.jpg)

## 已实现的玩法

- 三名神话角色各有移动特点和两项技能；三条赛道包含坡道、倾斜弯道、立体环轨、轨道和分支。
- 下坡惯性加速、跳跃、磨轨、音速状态、冲刺与角色技能可以组合使用。
- 收集金币，躲过障碍，按赛道目标时间争取奖牌；支持暂停和重跑。
- 电脑键盘、手机多点触控、本机成绩和可选 Node / SQLite 成绩服务。
- 当前角色包含 Idle、Warmup、Run、Boost、Hit 五段动画与表情；环境和音效随比赛状态变化。

| 操作 | 按键 |
| --- | --- |
| 出发 | Enter 或点击「即刻出发」 |
| 横移 | A / D；触屏按住左右区域或拖动 |
| 跳跃 / 冲刺 | 空格 / Shift |
| 第一、第二技能 | E / Q |
| 暂停 / 重跑 | Esc / R |

## 本地运行

项目声明 Node.js ≥ 22.13；本轮使用 Windows、Node.js 24.15.0。先按锁文件安装依赖：

```sh
npm ci --ignore-scripts
npm run dev -- --hostname 127.0.0.1 --port 5173
```

公开构建使用独立的通用 Vite / Vinext 配置，不需要 `.openai/hosting.json`、托管账户或生产环境变量。默认前端没有生产 API 代理：

```sh
npm run build
npm start -- --port 5188
npm run typecheck
npm test
```

静态产物位于 `dist/client/`，预览地址为 <http://127.0.0.1:5188/>。默认可玩单人模式并保存本机成绩。可选 `npm run start:records` 会在本地创建成绩数据库；启用前请自行配置服务环境，勿提交数据库、密码或环境文件。

## 验证记录

截图于 2026-10-12 在本机真实 Chrome 会话拍摄：首页、出发、倒计时、正常前进与赫尔墨斯技能均已验证，没有页面异常。游戏素材与本公开版本一致。没有调用付费模型或生产服务。

本公开版使用锁定依赖验证 `npm run build`、`npm run typecheck` 和 `npm test`。角色资产测试已改为核对公开运行文件与清单；不再要求未分发的历史研究模型或私人创作报告。成绩服务测试使用临时测试数据，不访问真实数据库。未验证生产部署、手机真机、长期游玩或完整浏览器通关。

## 技术与目录

TypeScript、React、Three.js、Vinext / Vite。核心玩法在 `game/`，页面在 `app/`，运行素材在 `public/`，可选成绩服务源码在 `server/`。

当前为时间挑战原型，没有追逐敌人、血量或死亡功能。成绩服务接受客户端成绩，未提供反作弊保证。生产环境配置、数据库、创作账户记录和原 Git 历史均未复制进本目录。

## 素材来源与许可证

自有代码采用 [MIT](LICENSE)，素材许可范围单列于 [ASSETS.md](ASSETS.md)。维护者确认当前游戏素材可商业使用和分发；第三方依赖、生成工具与服务保留各自条款，不统一改授为 MIT。

当前三角色为 `tripo-lively-heroes-expressions-v3` 版本，来自 Tripo Studio 并经 Blender 制作骨骼、五段动画及表情，**不是 CC0**。来源说明与哈希保留在 `public/credits.txt`、`public/models/manifest.json`。历史 KayKit CC0 研究文件未包含在本仓库。

音乐和音效的生成版本、处理及文件哈希见 `public/audio/CREDITS.txt` 和 `public/audio/manifest.json`。原创环境模型随游戏保留。私人账户、生产环境、数据库、创作原始记录、缓存和旧 Git 历史均未分发。

2026-10-13 公开版实测：标准 npm run build、npm run typecheck 与 npm test 均通过；100 项测试全部通过、无跳过。构建无需私人托管配置。

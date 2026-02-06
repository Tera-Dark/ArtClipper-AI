<div align="center">

# 🎨 ArtClipper AI

**智能图像切片工具 - AI 驱动的漫画分镜 & 素材拆解神器**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Tera-Dark/ArtClipper-AI)

</div>

---

## ✨ 功能特性

| 功能 | 描述 |
|------|------|
| 🤖 **AI 智能识别** | 基于 Gemini Vision 自动识别图像中的独立元素 |
| 🔮 **魔法扫描** | 基于颜色算法的本地快速分割（无需 API） |
| 📐 **网格切片** | 传统均匀网格分割模式 |
| ✏️ **手动绘制** | 支持手动框选和调整切片区域 |
| 📦 **批量处理** | 一次导入多张图片，批量执行识别和导出 |
| 💾 **本地存储** | 使用 IndexedDB 保存工作进度，刷新不丢失 |
| ↩️ **撤销/重做** | 完整的操作历史记录 |

---

## 🚀 快速开始

### 在线使用

访问部署好的 Vercel 站点即可直接使用！

### 本地运行

```bash
# 克隆仓库
git clone https://github.com/Tera-Dark/ArtClipper-AI.git
cd ArtClipper-AI

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

---

## 🔧 配置说明

### AI 识别配置

点击右上角 ⚙️ **设置** 按钮，配置以下选项：

| 配置项 | 说明 |
|--------|------|
| **API Key** | Gemini API 密钥（[获取地址](https://aistudio.google.com/apikey)） |
| **自定义 URL** | 支持 OpenAI 兼容的代理服务（如 Liaobots、ZenMux 等） |
| **模型名称** | 默认 `gemini-2.0-flash-exp`，可切换其他 Vision 模型 |

> 💡 **提示**: 如果直连 Google API 受限，可使用支持 OpenAI 格式的代理服务。

---

## 📖 使用教程

### 1️⃣ 导入图片

- 点击左侧 **"导入图片"** 按钮
- 或直接 **拖拽图片** 到窗口
- 支持 PNG、JPG、WebP 等常见格式

### 2️⃣ 选择切片模式

| 模式 | 适用场景 | 操作 |
|------|----------|------|
| **AI** | 漫画分镜、复杂素材 | 点击"开始 AI 识别" |
| **扫描** | 白底素材、简单图集 | 调整灵敏度后点击"运行魔法扫描" |
| **网格** | 规则排列的素材 | 设置行列数后自动生成 |
| **手动** | 自由绘制 | 在图片上直接拖拽框选 |

### 3️⃣ 调整切片

- **移动**: 拖拽切片中心区域
- **缩放**: 拖拽边缘控制点
- **删除**: 选中后按 `Delete` 键

### 4️⃣ 导出

点击 **"导出"** 按钮，可选择：
- 内边距（Padding）
- 输出格式（PNG / JPEG / WebP）
- 批量下载或逐个保存

---

## 🛠️ 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **样式**: Tailwind CSS
- **AI 服务**: Google Gemini Vision API
- **本地存储**: IndexedDB

---

## 📝 更新日志

### v1.0.0 (2026-02-06)
- ✅ AI 智能识别功能
- ✅ 魔法扫描本地分割
- ✅ 网格切片模式
- ✅ 手动绘制模式
- ✅ 批量处理与导出
- ✅ 撤销/重做系统
- ✅ 一键重试机制
- ✅ 优化 API 响应速度（图片压缩）

---

## 📄 许可证

MIT License

---

<div align="center">

**Made with ❤️ by Tera-Dark**

</div>

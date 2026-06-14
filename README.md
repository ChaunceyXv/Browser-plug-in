<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <title>Via 书签启动</title>
    <!-- 极简风格：只展示一个清晰明显的链接，无任何多余装饰 -->
    <style>
        /* 重置边距，确保链接占据视觉重心 */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            /* 非常干净的中性背景，但为了凸显链接存在感，使用极浅灰底色 */
            background: #fafafc;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            padding: 1.5rem;
        }

        /* 链接容器，确保链接可点区域舒适，但依旧只有一个元素 */
        .link-wrapper {
            text-align: center;
            /* 无任何装饰性卡片背景，仅保证链接本身显眼 */
        }

        a {
            /* 纯链接样式，但加大加粗，更易点击 */
            display: inline-block;
            font-size: 1.8rem;
            font-weight: 540;
            font-family: inherit;
            text-decoration: none;
            background: #ffffff;
            color: #1c6b3f;          /* Via 浏览器的标志性绿色调 */
            padding: 0.8rem 2rem;
            border-radius: 60px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.02);
            transition: all 0.2s ease;
            border: 1px solid #e2e6ea;
            letter-spacing: 0.3px;
        }

        /* 悬停/触摸反馈提升交互感，但不改变页面结构，依然只有一个链接核心 */
        a:hover {
            background: #f0f9f0;
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
            border-color: #bdddc0;
            transform: scale(1.02);
        }

        a:active {
            transform: scale(0.98);
            background: #e6f2e6;
        }

        /* 确保没有任何额外的文字、图片或装饰块，只有链接本身 */
        /* 并且这个链接就是唯一的页面内容 */
    </style>
</head>
<body>
    <div class="link-wrapper">
        <!-- 唯一的内容: via://bookmarks 超链接 -->
        <a href="via://bookmarks" title="打开 Via 浏览器书签页面">via://bookmarks</a>
    </div>
</body>
</html>

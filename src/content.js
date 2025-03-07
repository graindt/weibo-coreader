// 创建固定结果容器
function createFixedContainer() {
  const container = document.createElement('div');
  container.className = 'fixed-analysis-container hidden';
  container.innerHTML = `
    <div class="fixed-analysis-header">
      <span>微博分析</span>
      <button class="close-analysis-btn">关闭</button>
    </div>
    <div class="analysis-content">
      <div class="analysis-text"></div>
    </div>
  `;

  // 添加关闭按钮事件
  container.querySelector('.close-analysis-btn').addEventListener('click', () => {
    container.classList.add('hidden');
  });

  document.body.appendChild(container);
  return container;
}

// 获取或创建固定结果容器
let fixedContainer = null;
function getFixedContainer() {
  if (!fixedContainer) {
    fixedContainer = createFixedContainer();
  }
  return fixedContainer;
}

// 使用 MutationObserver 监听微博内容变化
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        injectAnalysisButtons(node);
      }
    });
  });
});

// 注入分析按钮的主要函数
function injectAnalysisButtons(container) {
  // 查找所有微博内容区域
  const posts = container.querySelectorAll('.Feed_wrap_3v9LH:not([data-analysis-injected])');
  console.log('[Weibo Reader] Found posts:', posts.length);

  posts.forEach((post) => {
    // 标记已处理
    post.setAttribute('data-analysis-injected', 'true');

    // 获取互动数据
    const contentText = post.querySelector('.detail_wbtext_4CRf9')?.innerText || '';
    console.log('[Weibo Reader] Found post content:', contentText.slice(0, 50) + '...');

    // 创建分析按钮
    const button = document.createElement('button');
    button.className = 'weibo-analysis-btn';
    button.innerText = '分析';

    // 添加点击事件
    button.addEventListener('click', async () => {
      try {
        button.disabled = true;
        button.innerText = '分析中...';

        // 获取固定容器
        const container = getFixedContainer();
        const contentDiv = container.querySelector('.analysis-text');

        // 从storage获取设置
        const settings = await chrome.storage.local.get(['promptTemplate']);
        const prompt = (settings.promptTemplate || '请分析这条微博的事实和观点');
        console.log('[Weibo Reader] Analyzing post content:', contentText);
        console.log('[Weibo Reader] Analyzing post with prompt:', prompt);

        // 发送消息给background script处理API调用
        console.log('[Content] 发送分析请求给background:', {
          type: 'analyzeWeibo',
          contentLength: contentText?.length,
          prompt
        });

        const response = await chrome.runtime.sendMessage({
          type: 'analyzeWeibo',
          content: contentText,
          prompt
        }).catch(error => {
          console.error('[Content] 发送消息失败:', error);
          throw error;
        });

        console.log('[Content] 收到background响应:', response);

        // 验证响应
        if (!response || !response.result) {
          throw new Error('无效的分析结果');
        }

        // 显示结果
        contentDiv.innerHTML = response.result.replace(/\n/g, '<br>');
        container.classList.remove('hidden');
        console.log('[Weibo Reader] Analysis completed and displayed');

      } catch (error) {
        console.error('[Weibo Reader] Analysis failed:', error);
        const container = getFixedContainer();
        container.querySelector('.analysis-text').innerHTML = `
          <div class="analysis-error">
            分析失败: ${error.message}
          </div>
        `;
        container.classList.remove('hidden');
      } finally {
        button.disabled = false;
        button.innerText = '分析';
      }
    });

    // 插入按钮
    const footer = post.querySelector('footer');
    if (footer) {
      const toolbarLeft = footer.querySelector('.toolbar_left_2vlsY');
      if (toolbarLeft) {
        const buttonWrapper = document.createElement('div');
        buttonWrapper.className = 'woo-box-item-flex toolbar_item_1ky_D';
        buttonWrapper.appendChild(button);
        toolbarLeft.appendChild(buttonWrapper);
        console.log('[Weibo Reader] Successfully injected analysis button');
      } else {
        console.warn('[Weibo Reader] Could not find toolbar_left_2vlsY');
      }
    } else {
      console.warn('[Weibo Reader] Could not find footer element');
    }
  });
}

// 启动观察器
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// 初始处理现有内容
injectAnalysisButtons(document.body);

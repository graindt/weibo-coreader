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

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 检查节点是否相关
function isRelevantNode(node) {
  return (
    node.classList?.contains('Feed_wrap_3v9LH') ||
    node.querySelector?.('.Feed_wrap_3v9LH')
  );
}

// 使用 MutationObserver 监听微博内容变化
const observer = new MutationObserver(
  debounce((mutations) => {
    const relevantMutations = mutations.filter(mutation => {
      // 过滤掉属性变化
      if (mutation.type !== 'childList') return false;

      // 检查添加的节点是否包含相关内容
      const hasRelevantAddedNodes = Array.from(mutation.addedNodes).some(node =>
        node.nodeType === Node.ELEMENT_NODE && isRelevantNode(node)
      );

      return hasRelevantAddedNodes;
    });

    if (relevantMutations.length === 0) return;

    // 暂时断开观察器避免处理过程中触发新的mutations
    observer.disconnect();

    try {
      relevantMutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE && isRelevantNode(node)) {
            injectAnalysisButtons(node);
          }
        });
      });
    } finally {
      // 重新连接观察器
      startObserver();
    }
  }, 100)
);

// 注入分析按钮的主要函数
function injectAnalysisButtons(container) {
  // 查找所有微博内容区域
  const posts = container.querySelectorAll('.Feed_wrap_3v9LH:not([data-analysis-injected])');
  console.log('[Weibo Reader] Found posts:', posts.length);

  posts.forEach(async (post) => {
    // 标记已处理
    post.setAttribute('data-analysis-injected', 'true');

    // 获取指定容器中的微博文本
    function getPostText(container) {
      return container.querySelector('.detail_wbtext_4CRf9')?.innerText || '';
    }

    // 获取原微博内容
    const originalContent = getPostText(post);

    // 获取转发微博内容
    const retweetContent = post.querySelector('.Feed_retweet_JqZJb') ?
      getPostText(post.querySelector('.Feed_retweet_JqZJb')) :
      '';

    // 合并内容
    let contentText = retweetContent ?
      `转发内容：\n${originalContent}\n\n原微博内容：\n${retweetContent}` :
      originalContent;

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

        // 获取完整微博内容的函数
        async function getFullContent(container) {
          // 检查是否有展开按钮
          const expandButton = container.querySelector('span.expand');
          if (expandButton && expandButton.textContent === '展开') {
            // 点击展开按钮
            expandButton.click();
            // 等待内容更新
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          return container.querySelector('.detail_wbtext_4CRf9')?.innerText || '';
        }

        // 展开并获取完整内容
        const fullOriginalContent = await getFullContent(post);
        const retweetContainer = post.querySelector('.Feed_retweet_JqZJb');
        const fullRetweetContent = retweetContainer ? await getFullContent(retweetContainer) : '';

        // 更新contentText为完整内容
        contentText = fullRetweetContent ?
          `转发内容：\n${fullOriginalContent}\n\n原微博内容：\n${fullRetweetContent}` :
          fullOriginalContent;

        // 从storage获取设置并添加错误处理
        let prompt = '请分析这条微博的事实和观点';
        try {
          const settings = await chrome.storage.local.get(['promptTemplate']);
          if (settings && settings.promptTemplate) {
            prompt = settings.promptTemplate;
          }
        } catch (error) {
          console.warn('[Weibo Reader] Failed to get settings:', error);
          // 继续使用默认prompt
        }
        console.log('[Weibo Reader] Analyzing post content:', contentText);
        console.log('[Weibo Reader] Analyzing post with prompt:', prompt);

        // 清空并显示结果容器
        contentDiv.innerHTML = '';
        container.classList.remove('hidden');

        // 设置流式响应监听器
        const streamListener = (message) => {
          if (message.type === 'streamResponse') {
            contentDiv.innerHTML += message.content.replace(/\n/g, '<br>');
            // 自动滚动到底部
            contentDiv.scrollTop = contentDiv.scrollHeight;
          }
        };

        // 添加消息监听
        chrome.runtime.onMessage.addListener(streamListener);

        // 发送消息给background script处理API调用
        console.log('[Content] 发送分析请求给background:', {
          type: 'analyzeWeibo',
          contentLength: contentText?.length,
          prompt
        });

        try {
          const response = await chrome.runtime.sendMessage({
            type: 'analyzeWeibo',
            content: contentText,
            prompt
          });

          console.log('[Content] 收到background最终响应:', response);

          if (!response || !response.result) {
            throw new Error('无效的分析结果');
          }

          console.log('[Weibo Reader] Analysis completed');
        } finally {
          // 移除消息监听
          chrome.runtime.onMessage.removeListener(streamListener);
        }

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
    const footers = post.querySelectorAll('footer');

    if (footers.length > 0) {
      // 选择最后一个footer
      const footer = footers[footers.length - 1];
      // 根据是否是转发微博选择不同的工具栏
      const toolbar = footer.querySelector('.toolbar_left_2vlsY');
      if (toolbar) {
        // 找到所有现有的工具栏项
        const existingButtons = toolbar.querySelectorAll('.toolbar_item_1ky_D');
        const lastButton = existingButtons[existingButtons.length - 1];

        const buttonWrapper = document.createElement('div');
        buttonWrapper.className = 'woo-box-item-flex toolbar_item_1ky_D';
        buttonWrapper.appendChild(button);

        // 在最后一个按钮之后插入
        if (lastButton) {
          lastButton.insertAdjacentElement('afterend', buttonWrapper);
        } else {
          toolbar.appendChild(buttonWrapper);
        }
        console.log('[Weibo Reader] Successfully injected analysis button');
      } else {
        console.warn('[Weibo Reader] Could not find toolbar');
      }
    } else {
      console.warn('[Weibo Reader] Could not find footer');
    }
  });
}

// 启动观察器函数
function startObserver() {
  // 找到主要内容容器
  const mainContent = document.querySelector('.Main_full_1dfQX') || document.body;

  observer.observe(mainContent, {
    childList: true,
    subtree: true
  });
}

// 初始启动
startObserver();
// 初始处理现有内容
injectAnalysisButtons(document.body);

// 页面切换时重新初始化
window.addEventListener('popstate', () => {
  setTimeout(() => {
    startObserver();
    injectAnalysisButtons(document.body);
  }, 500);
});

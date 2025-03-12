// Initialize the extension
async function initializeExtension() {
  // Dynamically import logger
  const { logger } = await import(chrome.runtime.getURL('utils/logger.js'));

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

// 检查节点是否为微博内容或包含微博内容
function isRelevantNode(node) {
  // 检查节点类型
  if (node.nodeType !== Node.ELEMENT_NODE) return false;

  // 直接检查常见的微博容器类名
  const relevantClasses = [
    'Feed_wrap_3v9LH',
    'Feed_body_3R1tW',
    'Main_full_1dfQX',
    'vue-recycle-scroller__item-view'
  ];

  for (const className of relevantClasses) {
    if (node.classList?.contains(className) || node.querySelector?.(`.${className}`)) {
      return true;
    }
  }

  // 检查是否包含微博特征元素
  return !!(
    node.querySelector?.('.detail_wbtext_4CRf9') ||
    node.querySelector?.('.Feed_retweet_JqZJb') ||
    node.querySelector?.('.toolbar_left_2vlsY')
  );
}

// 使用 MutationObserver 监听微博内容变化
const observer = new MutationObserver((mutations) => {
  const nodesToProcess = new Set();

  mutations.forEach(mutation => {
    // 检查新增的节点
    mutation.addedNodes.forEach(node => {
      if (isRelevantNode(node)) {
        nodesToProcess.add(node);
      }
    });

    // 检查目标节点及其子元素
    if (isRelevantNode(mutation.target)) {
      nodesToProcess.add(mutation.target);
    }

    // 检查目标节点的父级元素
    let parent = mutation.target.parentElement;
    while (parent) {
      if (isRelevantNode(parent)) {
        nodesToProcess.add(parent);
        break;
      }
      parent = parent.parentElement;
    }
  });

  // 处理收集到的所有相关节点
  nodesToProcess.forEach(node => {
    injectAnalysisButtons(node);
  });
});

// 注入分析按钮的主要函数
function injectAnalysisButtons(container) {
  // 查找所有微博内容区域
  let posts = [];

  // 首先查找所有常规微博
  const regularPosts = container.querySelectorAll('.Feed_wrap_3v9LH:not([data-analysis-injected])');
  posts.push(...Array.from(regularPosts));

  // 如果容器本身是微博但未被处理，也将其加入
  if (container.classList?.contains('Feed_wrap_3v9LH') && !container.hasAttribute('data-analysis-injected')) {
    posts.push(container);
  }

  // 查找可能的其他微博容器类型
  const alternativePosts = container.querySelectorAll('.Feed_body_3R1tW:not([data-analysis-injected])');
  posts.push(...Array.from(alternativePosts));

  // 去重
  posts = Array.from(new Set(posts));

  logger.info('Found posts:', posts.length);

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

    logger.info('Found post content:', contentText.slice(0, 50) + '...');

    // 创建分析按钮
    const button = document.createElement('button');
    button.className = 'weibo-analysis-btn';
    button.innerText = '分析';

    // 添加点击事件
    button.addEventListener('click', async () => {
      // 检查按钮状态判断是否正在分析
      if (button.innerText === '分析中...') {
        // 取消当前分析
        try {
          await chrome.runtime.sendMessage({ type: 'cancelAnalysis' });
          button.disabled = false;
          button.innerText = '分析';
          return;
        } catch (error) {
          logger.error('Failed to cancel analysis:', error);
        }
      }

      try {
        button.disabled = true;
        button.innerText = '分析中...';

        // 获取固定容器
        const container = getFixedContainer();
        const contentDiv = container.querySelector('.analysis-text');

        // 清空结果容器
        contentDiv.innerHTML = '';

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
          logger.warn('Failed to get settings:', error);
          // 继续使用默认prompt
        }
        logger.info('Analyzing post content:', contentText);
        logger.info('Analyzing post with prompt:', prompt);

        // 清空并显示结果容器
        contentDiv.innerHTML = '';
        container.classList.remove('hidden');

        // 设置流式响应监听器
        const streamListener = (message) => {
          logger.info('Received message:', message);
          if (message.type === 'streamResponse') {
            contentDiv.innerHTML += message.content.replace(/\n/g, '<br>');
            // 自动滚动到底部
            contentDiv.scrollTop = contentDiv.scrollHeight;
          }
        };

        // 添加消息监听
        chrome.runtime.onMessage.addListener(streamListener);

        // 发送消息给background script处理API调用
        logger.info('发送分析请求给background:', {
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

          logger.info('收到background最终响应:', response);

          if (response.error) {
            throw new Error(response.error);
          }

          if (!response || !response.result) {
            throw new Error('无效的分析结果');
          }

          logger.info('Analysis completed');
        } finally {
          // 移除消息监听
          chrome.runtime.onMessage.removeListener(streamListener);
        }

      } catch (error) {
        logger.error('Analysis failed:', error);
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
        logger.info('Successfully injected analysis button');
      } else {
        logger.warn('Could not find toolbar');
      }
    } else {
      logger.warn('Could not find footer');
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
}

// Start the extension
initializeExtension().catch(error => {
  console.error('[Weibo Reader] Failed to initialize:', error);
});

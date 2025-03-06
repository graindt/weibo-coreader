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
  const posts = container.querySelectorAll('.weibo-text:not([data-analysis-injected])');

  posts.forEach((post) => {
    // 标记已处理
    post.setAttribute('data-analysis-injected', 'true');

    // 创建分析按钮
    const button = document.createElement('button');
    button.className = 'weibo-analysis-btn';
    button.innerText = '分析';

    // 创建结果容器
    const resultContainer = document.createElement('div');
    resultContainer.className = 'weibo-analysis-result';
    resultContainer.style.display = 'none';

    // 添加点击事件
    button.addEventListener('click', async () => {
      try {
        button.disabled = true;
        button.innerText = '分析中...';

        // 获取微博文本
        const content = post.innerText;

        // 从storage获取设置
        const settings = await chrome.storage.local.get(['promptTemplate']);
        const prompt = (settings.promptTemplate || '请分析这条微博的情感倾向，并给出3个关键点').replace('{text}', content);

        // 发送消息给background script处理API调用
        const response = await chrome.runtime.sendMessage({
          type: 'analyzeWeibo',
          content,
          prompt
        });

        // 显示结果
        resultContainer.innerHTML = `
          <div class="analysis-content">
            ${response.result.replace(/\n/g, '<br>')}
          </div>
        `;
        resultContainer.style.display = 'block';

      } catch (error) {
        resultContainer.innerHTML = `
          <div class="analysis-error">
            分析失败: ${error.message}
          </div>
        `;
        resultContainer.style.display = 'block';
      } finally {
        button.disabled = false;
        button.innerText = '分析';
      }
    });

    // 插入按钮和结果容器
    const actionBar = post.closest('.weibo-main').querySelector('.weibo-opt');
    actionBar.appendChild(button);
    actionBar.appendChild(resultContainer);
  });
}

// 启动观察器
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// 初始处理现有内容
injectAnalysisButtons(document.body);

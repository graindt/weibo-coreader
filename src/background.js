// Ollama API配置
const API_ENDPOINT = 'http://localhost:11434/api/generate';

// 处理来自content script的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('[Background] 收到消息:', request);
  if (!request || !request.type) {
    console.error('[Background] Invalid message received:', request);
    sendResponse({ error: 'Invalid message format' });
    return false;
  }

  if (request.type === 'analyzeWeibo') {
    console.log('[Background] 开始处理分析请求, sender:', sender);
    handleAnalysis({ ...request, tabId: sender.tab.id })
      .then(result => {
        console.log('[Background] 分析完成:', result);
        sendResponse({ result: result.response });
      })
      .catch(error => {
        console.error('[Background] 分析失败:', error);
        sendResponse({
          result: `分析失败: ${error.message}`,
          error: error.message
        });
      });
    return true; // 异步响应
  }
});

// 处理微博分析请求
async function handleAnalysis(request) {
  const { content, prompt, tabId } = request;
  console.log('[Background] 分析内容:', content?.slice(0, 100) + '...');
  console.log('[Background] 使用提示词:', prompt);
  console.log('[Background] Tab ID:', tabId);

  if (!content) {
    console.error('[Background] 错误: 未能获取微博内容');
    throw new Error('未能获取微博内容');
  }

  // 获取用户选择的模型
  const { modelName = 'gemma2:2b' } = await chrome.storage.local.get(['modelName']);
  console.log('[Background] 使用模型:', modelName);

  try {
    const requestBody = {
      model: modelName,
      prompt: `${prompt}\n\n微博内容如下: ${content}`,
      stream: true
    };
    console.log('[Background] 发送API请求:', {
      endpoint: API_ENDPOINT,
      model: requestBody.model,
      promptLength: requestBody.prompt.length
    });

    console.log('[Background] 尝试连接Ollama服务器...');
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('[Background] API响应状态:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error('API请求失败: ' + response.statusText);
    }

    const reader = response.body.getReader();
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 将 Uint8Array 转换为文本
        const text = new TextDecoder().decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.trim()) {
            try {
              const json = JSON.parse(line);
              if (json.response) {
                fullResponse += json.response;
                // 发送部分响应到content script
                chrome.tabs.sendMessage(tabId, {
                  type: 'streamResponse',
                  content: json.response
                });
              }
            } catch (e) {
              console.warn('[Background] 解析流数据失败:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      response: fullResponse
    };

  } catch (error) {
    console.error('[Background] API请求失败:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    throw new Error(error.message || '分析请求失败');
  }
}

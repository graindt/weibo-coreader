import { logger } from './utils/logger.js';

// Ollama API配置
const API_ENDPOINT = 'http://localhost:11434/api/generate';

// 跟踪当前分析请求
let currentAnalysis = null;

// 取消当前分析
async function cancelCurrentAnalysis() {
  if (currentAnalysis) {
    await currentAnalysis.controller.abort();
    currentAnalysis = null;
  }
}

// 处理来自content script的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  logger.info('收到消息:', request);
if (!request || !request.type) {
    logger.error('Invalid message received:', request);
    sendResponse({ error: 'Invalid message format' });
    return false;
  }

  if (request.type === 'cancelAnalysis') {
    logger.info('收到取消分析请求');
    // 使用Promise处理异步操作
    new Promise(async () => {
      await cancelCurrentAnalysis();
      sendResponse({ success: true });
    });
    return true;
  } else if (request.type === 'analyzeWeibo') {
    logger.info('开始处理分析请求, sender:', sender);
    handleAnalysis({ ...request, tabId: sender.tab.id })
      .then(result => {
        logger.info('分析完成:', result);
        sendResponse({ result: result.response });
      })
      .catch(error => {
        logger.error('分析失败:', error);
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

  // 如果有正在进行的分析，先取消它
  await cancelCurrentAnalysis();

  // 创建新的 AbortController
  const controller = new AbortController();
  currentAnalysis = { controller, tabId };
  logger.info('分析内容:', content?.slice(0, 100) + '...');
  logger.info('使用提示词:', prompt);
  logger.info('Tab ID:', tabId);

  if (!content) {
    logger.error('错误: 未能获取微博内容');
    throw new Error('未能获取微博内容');
  }

  // 获取用户选择的模型
  const { modelName = 'gemma2:2b' } = await chrome.storage.local.get(['modelName']);
  logger.info('使用模型:', modelName);

  try {
    const requestBody = {
      model: modelName,
      prompt: `${prompt}\n\n微博内容如下: ${content}`,
      stream: true
    };
    logger.info('发送API请求:', {
      endpoint: API_ENDPOINT,
      model: requestBody.model,
      promptLength: requestBody.prompt.length
    });

    logger.info('尝试连接Ollama服务器...');
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    logger.info('API响应状态:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error('API请求失败: ' + response.statusText);
    }

    const reader = response.body.getReader();
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 如果请求被取消，跳出循环
        if (controller.signal.aborted) {
          throw new Error('分析已取消');
        }

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
              logger.warn('解析流数据失败:', e);
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
      logger.error('API请求失败:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      // 如果是取消请求导致的错误，返回特定消息
      if (error.name === 'AbortError' || error.message === '分析已取消') {
        throw new Error('分析已取消');
      }
      throw new Error(error.message || '分析请求失败');
    } finally {
      // 清理当前分析状态
      if (currentAnalysis?.controller === controller) {
        currentAnalysis = null;
      }
    }
}

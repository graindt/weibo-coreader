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
    console.log('[Background] 开始处理分析请求');
    handleAnalysis(request)
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
  const { content, prompt } = request;
  console.log('[Background] 分析内容:', content?.slice(0, 100) + '...');
  console.log('[Background] 使用提示词:', prompt);

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
      prompt: `You are a professional social media content analyzer.\n\nAnalysis request: ${prompt}\n\nWeibo content: ${content}`,
      stream: false
    };
    console.log('[Background] 发送API请求:', {
      endpoint: API_ENDPOINT,
      model: requestBody.model,
      promptLength: requestBody.prompt.length
    });

    let response;
    try {
      console.log('[Background] 尝试连接Ollama服务器...');
      response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify(requestBody)
      });
    } catch (networkError) {
      console.error('[Background] 网络错误:', {
        name: networkError.name,
        message: networkError.message,
        type: networkError.type,
        cause: networkError.cause
      });
      throw new Error('无法连接到Ollama服务器。请确保:\n1. Ollama正在运行\n2. 使用 OLLAMA_ORIGINS="*" ollama serve 命令启动Ollama以允许跨域请求');
    }

    console.log('[Background] API响应状态:', response.status, response.statusText);

    if (!response.ok) {
      console.error('[Background] API请求失败:', response.status, response.statusText);
      let errorMessage = '请求失败';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
        console.error('[Background] API错误详情:', errorData);
      } catch (e) {
        console.error('[Background] 无法解析错误响应:', e);
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('[Background] API返回数据:', {
      hasResponse: !!data.response,
      responseLength: data.response?.length ?? 0,
      fullData: data
    });

    // Ollama API返回格式处理
    if (!data.response) {
      console.error('[Background] API返回格式错误:', data);
      throw new Error('API返回格式错误');
    }

    return {
      response: data.response
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

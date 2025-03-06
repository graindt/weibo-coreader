// Ollama API配置
const API_ENDPOINT = 'http://localhost:11434/api/generate';

// 处理来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'analyzeWeibo') {
    handleAnalysis(request)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true; // 异步响应
  }
});

// 处理微博分析请求
async function handleAnalysis(request) {
  const { content, prompt } = request;

  if (!content) {
    throw new Error('未能获取微博内容');
  }

  // 获取用户选择的模型
  const { modelName = 'mistral' } = await chrome.storage.local.get(['modelName']);

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        prompt: `You are a professional social media content analyzer.\n\nAnalysis request: ${prompt}\n\nWeibo content: ${content}`,
        stream: false
      })
    });

    if (!response.ok) {
      let errorMessage = '请求失败';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // 解析错误响应失败，使用默认错误信息
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Ollama API返回格式处理
    if (data.response) {
      return {
        result: data.response
      };
    } else {
      throw new Error('API返回格式错误');
    }

  } catch (error) {
    console.error('API请求失败:', error);
    throw new Error(error.message || '分析请求失败');
  }
}

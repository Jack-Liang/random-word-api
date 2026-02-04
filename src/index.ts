import { Router } from 'itty-router';

// 类型定义
type WordData = string[];
type LanguageMap = Record<string, WordData>;
type RateLimitData = Record<string, number>;

// 创建路由器
const router = Router();

// 内存中的速率限制存储（生产环境建议使用KV）
let rateLimits: RateLimitData = {};
const RATE_LIMIT_WINDOW = 5000; // 5秒

// 语言数据缓存
let languageData: LanguageMap = {
  en: ['hello', 'world', 'test', 'example', 'demo']
};
let availableLanguages: string[] = ['en'];

// 加载单词数据
async function loadWordData() {
  try {
    // 加载英文单词
    const englishResponse = await fetch('https://raw.githubusercontent.com/RazorSh4rk/random-word-api/master/words.json');
    const englishWords = await englishResponse.json() as WordData;
    languageData['en'] = englishWords;

    // 加载其他语言
    const languages = ['de', 'es', 'fr', 'it', 'pt-br', 'ro', 'zh'];
    for (const lang of languages) {
      try {
        const response = await fetch(`https://raw.githubusercontent.com/RazorSh4rk/random-word-api/master/languages/${lang}.json`);
        const words = await response.json() as WordData;
        languageData[lang] = words;
      } catch (error) {
        console.error(`Failed to load language ${lang}:`, error);
      }
    }

    // 更新可用语言列表
    availableLanguages = Object.keys(languageData);
    console.log('Loaded languages:', availableLanguages);
  } catch (error) {
    console.error('Failed to load word data:', error);
    // 保持回退数据
  }
}

// 标记是否已加载数据
let dataLoaded = false;

// 速率限制检查
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const lastRequest = rateLimits[ip];
  
  if (!lastRequest || now - lastRequest > RATE_LIMIT_WINDOW) {
    rateLimits[ip] = now;
    // 清理过期的速率限制数据
    Object.keys(rateLimits).forEach(key => {
      if (now - rateLimits[key] > RATE_LIMIT_WINDOW) {
        delete rateLimits[key];
      }
    });
    return true;
  }
  return false;
}

// JSON响应助手
function jsonResponse(data: any, status: number = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// 错误响应助手
function errorResponse(message: string, status: number = 403) {
  return jsonResponse({ error: message }, status);
}

// 根路径重定向
router.get('/', () => {
  return new Response(null, {
    status: 302,
    headers: { Location: '/home' }
  });
});

// 静态文件服务
router.get('/home', () => {
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Random Word API</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        .endpoint { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .example { background: #f5f5f5; padding: 10px; border-radius: 3px; font-family: monospace; }
      </style>
    </head>
    <body>
      <h1>Random Word API</h1>
      <p>A simple API to get random words in multiple languages.</p>
      
      <div class="endpoint">
        <h2>Endpoints</h2>
        
        <h3>/word</h3>
        <p>Get random words with optional parameters:</p>
        <ul>
          <li><code>number</code>: Number of words (default: 1)</li>
          <li><code>length</code>: Word length (default: any)</li>
          <li><code>lang</code>: Language code (default: en)</li>
          <li><code>diff</code>: Difficulty level 1-5 (default: any)</li>
        </ul>
        <div class="example">
          Example: <a href="/word?number=3&length=5&lang=en">/word?number=3&length=5&lang=en</a>
        </div>
      </div>
      
      <div class="endpoint">
        <h3>/all</h3>
        <p>Get all words in the specified language.</p>
        <div class="example">
          Example: <a href="/all?lang=en">/all?lang=en</a>
        </div>
      </div>
      
      <div class="endpoint">
        <h3>/languages</h3>
        <p>Get all available languages.</p>
        <div class="example">
          Example: <a href="/languages">/languages</a>
        </div>
      </div>
    </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' }
  });
});

// 获取可用语言列表
router.get('/languages', async () => {
  // 首次请求时加载数据
  if (!dataLoaded) {
    await loadWordData();
    dataLoaded = true;
  }
  return jsonResponse(availableLanguages);
});

// 获取所有单词
router.get('/all', async (request) => {
  // 首次请求时加载数据
  if (!dataLoaded) {
    await loadWordData();
    dataLoaded = true;
  }

  // 检查速率限制
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(ip)) {
    return errorResponse('You hit the rate limit, try again in a few seconds');
  }

  // 获取语言参数
  const url = new URL(request.url);
  const lang = url.searchParams.get('lang') || 'en';

  // 检查语言是否可用
  if (!languageData[lang]) {
    return errorResponse('No translation for this language');
  }

  return jsonResponse(languageData[lang]);
});

// 获取随机单词
router.get('/word', async (request) => {
  // 首次请求时加载数据
  if (!dataLoaded) {
    await loadWordData();
    dataLoaded = true;
  }

  // 检查速率限制
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(ip)) {
    return errorResponse('You hit the rate limit, try again in a few seconds');
  }

  // 解析参数
  const url = new URL(request.url);
  const number = Math.max(1, Math.min(100, parseInt(url.searchParams.get('number') || '1')));
  const length = parseInt(url.searchParams.get('length') || '-1');
  const lang = url.searchParams.get('lang') || 'en';
  const diff = parseInt(url.searchParams.get('diff') || '-1');

  // 检查语言是否可用
  if (!languageData[lang]) {
    return errorResponse('No translation for this language');
  }

  let words = languageData[lang];

  // 按长度过滤
  if (length > 0) {
    words = words.filter(word => word.length === length);
    if (words.length === 0) {
      return errorResponse('No words found with the specified length');
    }
  }

  // 随机排序
  words = words.sort(() => Math.random() - 0.5);

  // 应用难度过滤（简化实现）
  if (diff >= 1 && diff <= 5 && number <= 5) {
    // 这里使用简化的难度过滤，实际项目中可以根据需要实现更复杂的逻辑
    const filteredWords = words.slice(0, number * 10).sort(() => Math.random() - 0.5);
    words = filteredWords;
  }

  // 取指定数量的单词
  const result = words.slice(0, number);

  return jsonResponse(result);
});

// 404处理
router.all('*', () => {
  return errorResponse('Not found', 404);
});

// 导出Worker处理函数
export default {
  fetch: router.handle
};

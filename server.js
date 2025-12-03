const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 引入Prompt模板
const { 
  generateSceneAnalysisPrompt,
  generateBasicCleanupPrompt,
  generateDeepCleanupPrompt,
  generateLayoutOptimizePrompt,
  generateAddPropsPrompt,
  generateNegativePrompt 
} = require('./prompt-template');

// 日志文件输出（可选，方便查看错误日志）
const logFile = path.join(__dirname, 'server.log');
function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFile, logMessage, 'utf8');
  console.log(message); // 同时输出到控制台
}

const app = express();
const PORT = process.env.PORT || 5000;

// 中间件
app.use(cors());
app.use(express.json());

// 设置文件上传
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 提供静态文件服务
app.use(express.static('.'));

// 示例路由 - 返回API状态
app.get('/api/status', (req, res) => {
  res.json({ status: 'Server is running' });
});

// AI图像生成API路由
app.post('/api/enhance-room', upload.single('image'), async (req, res) => {
  try {
    const { scenario, props, step, previousImageUrl, clutterList, isRedo } = req.body;
    // isRedo: 是否是重新执行（用户觉得清理不够，需要继续清理）
    // clutterList: 从场景分析中提取的杂乱物品清单（用于后续步骤） 
    // step: 步骤（1=整理，2=添加物品）
    // previousImageUrl: 上一步的结果图片URL（用于第二步）
    // props: 用户指定的道具（可选，主要用于第二步）
    
    let imageBuffer = req.file ? req.file.buffer : null;
    
    // 如果提供了previousImageUrl（用于第二步或再次整理），需要从URL下载图片或解析base64
    if (previousImageUrl && !imageBuffer) {
      try {
        if (previousImageUrl.startsWith('data:image')) {
          // 处理base64 data URL
          const base64Data = previousImageUrl.split(',')[1];
          imageBuffer = Buffer.from(base64Data, 'base64');
          console.log('从previousImageUrl解析base64图片成功');
        } else {
          // 处理HTTP URL
          const imageResponse = await axios.get(previousImageUrl, { responseType: 'arraybuffer' });
          imageBuffer = Buffer.from(imageResponse.data);
          console.log('从previousImageUrl下载图片成功');
        }
      } catch (error) {
        console.error('处理previousImageUrl失败:', error.message);
        return res.status(400).json({ error: 'Failed to load previous image' });
      }
    }

    if (!imageBuffer) {
      return res.status(400).json({ error: 'Missing image' });
    }

    // 步骤5需要scenario，其他步骤不需要
    if (!scenario && step === '5') {
      return res.status(400).json({ error: 'Missing scenario for step 5' });
    }

    console.log('Received step:', step || '1 (场景分析)');
    console.log('Received scenario:', scenario || '(步骤1-4不需要)');
    console.log('Received props:', props || '(未指定)');

    // 实际AI处理 - 根据步骤选择不同的处理方式
    const result = await enhanceRoomImage(imageBuffer, scenario, props, step, clutterList, isRedo === 'true' || isRedo === true);

    // 步骤1（场景分析）返回文本分析，不修改图片
    if (step === '1') {
      res.json({
        success: true,
        analysis: result.analysis, // 文本分析结果
        description: result.description,
        clutterList: result.clutterList || '' // 返回提取的杂乱物品清单
      });
    } else {
      // 步骤2-5返回修改后的图片
    res.json({
      success: true,
      imageUrl: result.imageUrl,
      description: result.description
    });
    }

  } catch (error) {
    console.error('\n========== 图像处理错误 ==========');
    console.error('错误:', error);
    console.error('错误堆栈:', error.stack);
    console.error('===============================\n');
    res.status(500).json({ 
      error: 'Error processing image',
      message: error.message 
    });
  }
});

// 函数：使用AI服务增强房间图像
async function enhanceRoomImage(imageBuffer, scenario, props = '', step = '1', clutterList = '', isRedo = false) {
  // step: '1' = 场景分析, '2' = 基础清理, '3' = 深度整理, '4' = 布局优化, '5' = 添加道具
  // 这里我们将使用AI服务修改用户上传的图像
  // 支持多种AI服务：OpenAI DALL-E、Stability AI、通义千问等

  // 注意：您需要在.env文件中配置正确的API密钥
  // 先读取原始值用于调试
  const qwenApiKeyRaw = process.env.QWEN_API_KEY;
  const stabilityApiKeyRaw = process.env.STABILITY_API_KEY;
  const openAIApiKeyRaw = process.env.OPENAI_API_KEY;
  
  const openAIApiKey = openAIApiKeyRaw?.trim();
  const stabilityApiKey = stabilityApiKeyRaw?.trim();
  const qwenApiKey = qwenApiKeyRaw?.trim(); // 通义千问API密钥
  const qwenApiUrl = process.env.QWEN_API_URL?.trim(); // 通义千问API地址（从.env读取）
  const qwenModel = process.env.QWEN_MODEL?.trim(); // 通义千问模型（从.env读取）

  // 调试信息：显示检测到的API密钥（隐藏实际密钥内容）
  console.log('\n========== API密钥检测 ==========');
  console.log('原始值 - QWEN_API_KEY:', qwenApiKeyRaw ? `存在 (长度: ${qwenApiKeyRaw.length})` : '未配置');
  console.log('原始值 - STABILITY_API_KEY:', stabilityApiKeyRaw ? `存在 (长度: ${stabilityApiKeyRaw.length})` : '未配置');
  console.log('原始值 - OPENAI_API_KEY:', openAIApiKeyRaw ? `存在 (长度: ${openAIApiKeyRaw.length})` : '未配置');
  console.log('处理后 - 通义千问 (QWEN_API_KEY):', qwenApiKey ? `${qwenApiKey.substring(0, 10)}...` : '未配置或为空');
  console.log('处理后 - Stability AI (STABILITY_API_KEY):', stabilityApiKey ? `${stabilityApiKey.substring(0, 10)}...` : '未配置或为空');
  console.log('处理后 - OpenAI (OPENAI_API_KEY):', openAIApiKey ? `${openAIApiKey.substring(0, 10)}...` : '未配置或为空');
  console.log('通义千问模型 (QWEN_MODEL):', qwenModel);
  console.log('==================================\n');

  // 检查是否配置了API密钥
  if (!openAIApiKey && !stabilityApiKey && !qwenApiKey) {
    console.warn('未配置AI API密钥，使用模拟结果');
    // 如果没有配置API密钥，返回模拟结果
    return {
      imageUrl: `https://placehold.co/600x400/4a86e8/ffffff?text=${encodeURIComponent(scenario)}`,
      description: `AI根据您的"${scenario}"需求生成了房间改造方案（模拟结果）。请配置API密钥以使用真实AI服务。`
    };
  }

  // 优先使用支持图像编辑的API
  // 通义千问优先（国内访问快，支持图像编辑）
  // 检查API密钥是否存在且不为空字符串
  if (qwenApiKey && qwenApiKey.length > 0) {
    console.log('✅ 使用通义千问进行图像处理');
    console.log('使用的模型:', qwenModel);
    console.log('当前步骤:', step || '1 (整理)');
    return await enhanceWithQwen(imageBuffer, scenario, qwenApiKey, qwenApiUrl, qwenModel, props, step, clutterList, isRedo);
  } else {
    console.log('❌ 通义千问未配置或密钥为空，跳过通义千问');
    console.log('qwenApiKey值:', qwenApiKey);
    console.log('qwenApiKey类型:', typeof qwenApiKey);
    console.log('qwenApiKey长度:', qwenApiKey?.length);
  }
  
  // Stability AI支持image-to-image，可以真正修改用户上传的图像
  // 只有在没有配置通义千问时才使用Stability AI
  if (stabilityApiKey && stabilityApiKey.length > 0) {
    console.log('⚠️ 使用Stability AI进行图像编辑（通义千问未配置）');
    console.log('Stability AI API密钥长度:', stabilityApiKey.length);
    return await enhanceWithStabilityAI(imageBuffer, scenario, stabilityApiKey);
  } else {
    console.log('❌ Stability AI未配置或密钥为空');
  }
  
  // OpenAI DALL-E（仅生成新图像，不修改原图）
  if (openAIApiKey) {
    console.log('使用OpenAI DALL-E生成图像（注意：不修改原图）');
    return await enhanceWithDalle(imageBuffer, scenario, openAIApiKey);
  }
}

// 使用OpenAI的DALL-E API增强图像
async function enhanceWithDalle(imageBuffer, scenario, apiKey) {
  // 注意：DALL-E API不直接支持图像修改，所以我们创建一个基于场景描述的提示
  // 虽然接收了imageBuffer，但DALL-E只能生成新图像，不能修改原图
  const prompt = `a room designed for ${scenario}, professional interior design, high quality, detailed`;

  try {
    const response = await axios.post('https://api.openai.com/v1/images/generations', {
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024"
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const imageUrl = response.data.data[0].url;
    const description = `AI根据您的"${scenario}"需求生成了房间改造方案，使用DALL-E生成（注意：这是新生成的图像，不是修改原图）`;

    return { imageUrl, description };
  } catch (error) {
    // 输出详细的错误信息
    console.error('\n========== OpenAI DALL-E API 错误详情 ==========');
    console.error('错误状态码:', error.response?.status);
    console.error('错误状态文本:', error.response?.statusText);
    console.error('错误响应数据:', JSON.stringify(error.response?.data, null, 2));
    console.error('错误消息:', error.message);
    console.error('================================================\n');
    
    // 如果API调用失败，返回占位图片
    return {
      imageUrl: `https://placehold.co/600x400/4a86e8/ffffff?text=Error+with+DALL-E+API`,
      description: `调用DALL-E API时出错: ${error.response?.data?.message || error.message}。详细错误请查看服务器控制台。`
    };
  }
}

// 使用通义千问API进行图像处理
async function enhanceWithQwen(imageBuffer, scenario, apiKey, apiUrl, model, props, step = '1', clutterList = '', isRedo = false) {
  // 通义千问的图像编辑功能
  // 使用指定的模型进行图像编辑
  // 参考官方示例：https://bailian.console.aliyun.com/
  // 官方使用的是 MultiModalConversation API
  
  // 从参数或环境变量获取配置
  const baseUrl = apiUrl || process.env.QWEN_API_URL?.trim() || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  const qwenModel = model || process.env.QWEN_MODEL?.trim() || 'qwen-image-edit-plus';
  
  // 检查必要的配置
  if (!qwenModel) {
    throw new Error('QWEN_MODEL 未配置，请在 .env 文件中设置 QWEN_MODEL');
  }
  
  console.log('\n========== 通义千问 API 调用信息 ==========');
  console.log('⚠️ 如果出现URL错误，请检查API端点是否正确');
  console.log('当前使用的API URL:', baseUrl);
  console.log('使用的模型:', qwenModel);
  console.log('场景描述:', scenario);
  
  try {
    // 将图像buffer转换为base64
    const imageBase64 = imageBuffer.toString('base64');
    console.log('图像大小:', imageBuffer.length, 'bytes');
    console.log('Base64长度:', imageBase64.length);
    
    // 步骤1：场景分析 - 返回文本分析，不修改图片
    if (step === '1') {
      const analysisPrompt = generateSceneAnalysisPrompt();
      console.log('使用步骤1 Prompt：场景分析');
      
      // 调用Qwen进行场景分析（文本分析）
      const analysisRequestData = {
        model: qwenModel,
        input: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  image: `data:image/jpeg;base64,${imageBase64}`
                },
                {
                  text: analysisPrompt
                }
              ]
            }
          ]
        },
        parameters: {
          result_format: 'message',
          stream: false
        }
      };
      
      const analysisResponse = await axios.post(
        baseUrl,
        analysisRequestData,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          }
        }
      );
      
      // 提取分析结果
      let analysisText = '';
      if (analysisResponse.data.output && analysisResponse.data.output.choices) {
        const choice = analysisResponse.data.output.choices[0];
        if (choice.message && choice.message.content) {
          const textContent = choice.message.content.find(item => item.text);
          if (textContent) {
            analysisText = textContent.text;
          }
        }
      }
      
      // 从分析结果中提取杂乱物品清单
      let extractedClutterList = '';
      if (analysisText) {
        // 尝试从分析结果中提取【杂乱物品清单】部分
        const clutterMatch = analysisText.match(/【杂乱物品清单】[\s\S]*?(?=【|$)/i) || 
                            analysisText.match(/杂乱物品清单[\s\S]*?(?=【|$)/i) ||
                            analysisText.match(/杂乱物品[\s\S]*?(?=【|$)/i);
        if (clutterMatch) {
          extractedClutterList = clutterMatch[0].replace(/【杂乱物品清单】/gi, '').trim();
          console.log('提取的杂乱物品清单:', extractedClutterList.substring(0, 200) + '...');
        }
      }
      
      return {
        analysis: analysisText || '场景分析完成',
        description: 'AI已完成房间场景分析',
        clutterList: extractedClutterList // 返回提取的杂乱物品清单
      };
    }
    
    // 步骤2-5：图像编辑
    let prompt;
    if (step === '2') {
      prompt = generateBasicCleanupPrompt(clutterList, isRedo);
      console.log('使用步骤2 Prompt：基础清理', isRedo ? '(重新清理模式)' : '');
      if (clutterList) {
        console.log('包含杂乱物品清单，长度:', clutterList.length);
      }
    } else if (step === '3') {
      prompt = generateDeepCleanupPrompt(clutterList, isRedo);
      console.log('使用步骤3 Prompt：深度整理', isRedo ? '(重新整理模式)' : '');
      if (clutterList) {
        console.log('包含杂乱物品清单，长度:', clutterList.length);
      }
    } else if (step === '4') {
      prompt = generateLayoutOptimizePrompt(clutterList);
      console.log('使用步骤4 Prompt：布局优化');
      if (clutterList) {
        console.log('包含杂乱物品清单，长度:', clutterList.length);
      }
    } else if (step === '5') {
      prompt = generateAddPropsPrompt(scenario, props, clutterList);
      console.log('使用步骤5 Prompt：添加道具');
      if (clutterList) {
        console.log('包含杂乱物品清单，长度:', clutterList.length);
      }
    } else {
      // 默认使用基础清理
      prompt = generateBasicCleanupPrompt(clutterList);
      console.log('使用默认Prompt：基础清理');
    }
    
    const negativePrompt = generateNegativePrompt(clutterList);
    console.log('生成的Prompt长度:', prompt.length, '字符');
    console.log('Negative Prompt长度:', negativePrompt.length, '字符');
    
    // 根据官方Python示例，使用 messages 格式
    // 官方示例格式：
    // messages = [
    //   {
    //     "role": "user",
    //     "content": [
    //       {"image": "url或base64"},
    //       {"text": "提示词"}
    //     ]
    //   }
    // ]
    const requestData = {
      model: qwenModel, // 使用配置的模型
      input: {
        messages: [
          {
            role: 'user',
            content: [
              {
                image: `data:image/jpeg;base64,${imageBase64}`
              },
              {
                text: prompt
              }
            ]
          }
        ]
      },
      parameters: {
        result_format: 'message',
        stream: false,
        n: 1,
        watermark: true,
        negative_prompt: negativePrompt
      }
    };
    
    console.log('请求数据格式:', JSON.stringify({
      model: requestData.model,
      input: {
        messages: [
          {
            role: requestData.input.messages[0].role,
            content: [
              { image: `data:image/jpeg;base64,${imageBase64.substring(0, 50)}...` },
              { text: requestData.input.messages[0].content[1].text }
            ]
          }
        ]
      },
      parameters: requestData.parameters
    }, null, 2));
    console.log('==========================================\n');
    
    console.log('发送请求到:', baseUrl);
    console.log('请求头:', {
      'Authorization': `Bearer ${apiKey.substring(0, 10)}...`,
      'Content-Type': 'application/json'
    });
    
    const response = await axios.post(
      baseUrl,
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 图像处理可能需要较长时间，设置60秒超时
        validateStatus: function (status) {
          // 不抛出错误，让我们自己处理
          return status < 500;
        }
      }
    );
    
    console.log('响应状态码:', response.status);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));

    // 处理API响应
    // 根据官方API格式，响应应该是：
    // {
    //   "output": {
    //     "choices": [
    //       {
    //         "message": {
    //           "content": [
    //             {"image": "base64或url"}
    //           ]
    //         }
    //       }
    //     ]
    //   }
    // }
    console.log('API响应:', JSON.stringify(response.data, null, 2));
    
    let imageUrl;
    if (response.data.output && response.data.output.choices) {
      const choice = response.data.output.choices[0];
      if (choice.message && choice.message.content) {
        // 查找content中的image字段
        const imageContent = choice.message.content.find(item => item.image);
        if (imageContent) {
          if (imageContent.image.startsWith('http')) {
            // 如果是URL
            imageUrl = imageContent.image;
          } else {
            // 如果是base64
            imageUrl = `data:image/png;base64,${imageContent.image}`;
          }
        }
      }
    } else if (response.data.output?.task_id) {
      // 如果是异步任务，需要轮询获取结果
      console.log('检测到异步任务，task_id:', response.data.output.task_id);
      imageUrl = await pollQwenTaskResult(response.data.output.task_id, apiKey);
    } else {
      console.error('API响应格式不正确，完整响应:', JSON.stringify(response.data, null, 2));
      throw new Error('API响应格式不正确，请查看服务器日志');
    }
    
    // 根据步骤生成不同的描述
    let description;
    if (step === '2') {
      description = `AI已完成基础清理，移除了明显垃圾和杂物，使用通义千问图像编辑生成`;
    } else if (step === '3') {
      description = `AI已完成深度整理，清理了贴纸、污渍和细节问题，使用通义千问图像编辑生成`;
    } else if (step === '4') {
      description = `AI已完成布局优化，优化了物品摆放和空间利用，使用通义千问图像编辑生成`;
    } else if (step === '5') {
      description = `AI根据您的"${scenario}"需求添加了专业道具，使用通义千问图像编辑生成`;
    } else {
      description = `AI已完成基础清理，使用通义千问图像编辑生成`;
    }

    return { imageUrl, description };
  } catch (error) {
    // 输出详细的错误信息到控制台和日志文件
    const errorDetails = `
========== 通义千问 API 错误详情 ==========
错误状态码: ${error.response?.status || 'N/A'}
错误状态文本: ${error.response?.statusText || 'N/A'}
错误响应数据: ${JSON.stringify(error.response?.data, null, 2)}
错误消息: ${error.message}
请求URL: ${baseUrl}
请求方法: POST
===========================================
`;
    console.error(errorDetails);
    writeLog(errorDetails); // 同时写入日志文件
    
    // 尝试使用通义万相文生图作为备选方案
    try {
      console.log('尝试使用通义万相文生图作为备选方案');
      return await enhanceWithQwenWanx(imageBuffer, scenario, apiKey);
    } catch (fallbackError) {
      console.error('备选方案也失败:', fallbackError.response?.data || fallbackError.message);
      return {
        imageUrl: `https://placehold.co/600x400/4a86e8/ffffff?text=Error+with+Qwen+API`,
        description: `调用通义千问API时出错: ${error.response?.data?.message || error.message}。详细错误请查看服务器控制台。`
      };
    }
  }
}

// 轮询异步任务结果
async function pollQwenTaskResult(taskId, apiKey, maxAttempts = 30) {
  const pollUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
    
    try {
      const response = await axios.get(pollUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        }
      });
      
      if (response.data.output?.status === 'SUCCEEDED') {
        if (response.data.output.results?.[0]?.image) {
          return `data:image/png;base64,${response.data.output.results[0].image}`;
        } else if (response.data.output.results?.[0]?.url) {
          return response.data.output.results[0].url;
        }
      } else if (response.data.output?.status === 'FAILED') {
        throw new Error('任务执行失败');
      }
    } catch (error) {
      if (i === maxAttempts - 1) throw error;
    }
  }
  
  throw new Error('任务超时');
}

// 使用通义万相文生图作为备选方案（不修改原图，生成新图）
async function enhanceWithQwenWanx(imageBuffer, scenario, apiKey) {
  const baseUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation';
  
  const prompt = `a room designed for ${scenario}, professional interior design, high quality, detailed`;
  
  const response = await axios.post(
    baseUrl,
    {
      model: "wanx-v1",
      input: {
        prompt: prompt
      },
      parameters: {
        style: "<auto>",
        size: "1024*1024"
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }
    }
  );

  const imageUrl = response.data.output?.results?.[0]?.url || 
                   `data:image/png;base64,${response.data.output?.results?.[0]?.base64}`;
  
  const description = `AI根据您的"${scenario}"需求生成了房间改造方案，使用通义万相生成（注意：这是新生成的图像）`;

  return { imageUrl, description };
}

// 使用Stability AI的Image-to-Image API修改图像
async function enhanceWithStabilityAI(imageBuffer, scenario, apiKey) {
  // 使用image-to-image功能来修改用户上传的图像
  const engineId = 'stable-diffusion-xl-1024-v1-0'; // 使用支持image-to-image的引擎
  const apiHost = 'https://api.stability.ai';

  try {
    // 将图像buffer转换为base64
    const imageBase64 = imageBuffer.toString('base64');
    
    const response = await axios.post(
      `${apiHost}/v1/generation/${engineId}/image-to-image`,
      {
        text_prompts: [
          { 
            text: `transform this room for ${scenario}, professional interior design, high quality, detailed, maintain room structure`,
            weight: 1.0
          }
        ],
        init_image: imageBase64,
        image_strength: 0.35, // 控制修改强度，0.35表示保持原图结构但进行改造
        cfg_scale: 7,
        samples: 1,
        steps: 30,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    // 提取生成的图像
    const imageUrl = `data:image/png;base64,${response.data.artifacts[0].base64}`;
    const description = `AI根据您的"${scenario}"需求对房间进行了改造，使用Stable Diffusion图像编辑生成`;

    return { imageUrl, description };
  } catch (error) {
    // 输出详细的错误信息
    console.error('\n========== Stability AI API 错误详情 ==========');
    console.error('错误状态码:', error.response?.status);
    console.error('错误状态文本:', error.response?.statusText);
    console.error('错误响应数据:', JSON.stringify(error.response?.data, null, 2));
    console.error('错误消息:', error.message);
    console.error('请求URL:', `${apiHost}/v1/generation/${engineId}/image-to-image`);
    console.error('请求头:', JSON.stringify({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey ? apiKey.substring(0, 10) + '...' : '未配置'}`
    }, null, 2));
    console.error('===============================================\n');
    
    // 如果image-to-image失败，尝试使用text-to-image作为备选
    try {
      console.log('尝试使用text-to-image作为备选方案...');
      return await enhanceWithStabilityAITextToImage(imageBuffer, scenario, apiKey);
    } catch (fallbackError) {
      console.error('备选方案也失败:', fallbackError.response?.data || fallbackError.message);
    return {
      imageUrl: `https://placehold.co/600x400/4a86e8/ffffff?text=Error+with+Stability+AI`,
        description: `调用Stability AI API时出错: ${error.response?.data?.message || error.message}。详细错误请查看服务器控制台。`
      };
    }
  }
}

// Stability AI的text-to-image备选方案
async function enhanceWithStabilityAITextToImage(imageBuffer, scenario, apiKey) {
  const engineId = 'stable-diffusion-xl-1024-v1-0';
  const apiHost = 'https://api.stability.ai';

  const response = await axios.post(
    `${apiHost}/v1/generation/${engineId}/text-to-image`,
    {
      text_prompts: [
        { text: `a room designed for ${scenario}, professional interior design, high quality, detailed` }
      ],
      cfg_scale: 7,
      height: 1024,
      width: 1024,
      samples: 1,
      steps: 30,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  const imageUrl = `data:image/png;base64,${response.data.artifacts[0].base64}`;
  const description = `AI根据您的"${scenario}"需求生成了房间改造方案，使用Stable Diffusion生成`;

  return { imageUrl, description };
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API文档:`);
  console.log(`  GET  /api/status - 检查服务器状态`);
  console.log(`  POST /api/enhance-room - 上传图像并获取AI增强结果`);
  console.log(`\n在浏览器中访问 http://localhost:${PORT} 来使用应用`);
});
// 全局变量：保存每步的结果
let stepResults = {
    step1: null, // 场景分析（文本）
    step2: null, // 基础清理（图片URL）
    step3: null, // 深度整理（图片URL）
    step4: null, // 布局优化（图片URL）
    step5: null  // 添加道具（图片URL）
};

// 保存从场景分析中提取的杂乱物品清单
let clutterList = '';

// 整个上传区域可点击
const uploadArea = document.getElementById('uploadArea');
const imageUpload = document.getElementById('imageUpload');

// 点击上传区域触发文件选择
uploadArea.addEventListener('click', function(e) {
    if (e.target !== imageUpload) {
        imageUpload.click();
    }
});

// 图片预览功能
imageUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            document.getElementById('previewImage').src = event.target.result;
            document.getElementById('previewContainer').style.display = 'block';
            // 重置状态
            resetAllSteps();
        }
        reader.readAsDataURL(file);
    }
});

// 拖拽上传功能
uploadArea.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('dragover');
});

uploadArea.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('dragover');
    
    if (e.dataTransfer.files.length) {
        document.getElementById('imageUpload').files = e.dataTransfer.files;
        const file = e.dataTransfer.files[0];
        
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(event) {
                document.getElementById('previewImage').src = event.target.result;
                document.getElementById('previewContainer').style.display = 'block';
                resetAllSteps();
            }
            reader.readAsDataURL(file);
        }
    }
});

// 重置所有步骤
function resetAllSteps() {
    stepResults = {
        step1: null,
        step2: null,
        step3: null,
        step4: null,
        step5: null
    };
    clutterList = ''; // 重置杂乱物品清单
    document.getElementById('stepIndicator').style.display = 'none';
    document.getElementById('step1Section').style.display = 'block';
    document.getElementById('step2Section').style.display = 'none';
    document.getElementById('step3Section').style.display = 'none';
    document.getElementById('step4Section').style.display = 'none';
    document.getElementById('step5Section').style.display = 'none';
    
    // 隐藏所有结果容器
    document.getElementById('step1ResultContainer').style.display = 'none';
    document.getElementById('step2ResultContainer').style.display = 'none';
    document.getElementById('step3ResultContainer').style.display = 'none';
    document.getElementById('step4ResultContainer').style.display = 'none';
    document.getElementById('step5ResultContainer').style.display = 'none';
    
    // 重置步骤指示器
    updateStepIndicators(0);
}

// 更新步骤指示器
function updateStepIndicators(currentStep) {
    const indicators = ['step1Indicator', 'step2Indicator', 'step3Indicator', 'step4Indicator', 'step5Indicator'];
    indicators.forEach((id, index) => {
        const element = document.getElementById(id);
        if (element) {
            if (index < currentStep) {
                element.style.background = 'var(--accent-cyan)';
                element.style.opacity = '1';
            } else if (index === currentStep) {
                element.style.background = 'var(--accent-cyan)';
                element.style.opacity = '1';
            } else {
                element.style.background = 'var(--text-secondary)';
                element.style.opacity = '0.3';
            }
        }
    });
}

// 步骤1：场景分析
async function processStep1(isRedo = false) {
    const fileInput = document.getElementById('imageUpload');

    if (!fileInput.files[0]) {
        alert('请先上传房间照片');
        return;
    }

    // 显示加载状态
    document.getElementById('loading').style.display = 'block';
    document.getElementById('step1Btn').disabled = true;
    document.getElementById('stepIndicator').style.display = 'block';
    document.getElementById('currentStepText').textContent = '步骤1：场景分析';
    updateStepIndicators(0);

    try {
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);
        formData.append('step', '1');

        const response = await fetch('/api/enhance-room', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();

        // 保存步骤1结果（文本分析）
        stepResults.step1 = data.analysis;
        // 保存杂乱物品清单
        clutterList = data.clutterList || '';
        if (clutterList) {
            console.log('提取的杂乱物品清单:', clutterList.substring(0, 200) + '...');
        }

        // 显示步骤1结果
        document.getElementById('step1AnalysisText').textContent = data.analysis || '场景分析完成';
        document.getElementById('step1ResultContainer').style.display = 'block';
        document.getElementById('step1Section').style.display = 'none';
        
        // 自动进入步骤2
        setTimeout(() => {
            processStep2();
        }, 1000);
        
    } catch (error) {
        console.error('Error processing step 1:', error);
        showError('错误: ' + error.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('step1Btn').disabled = false;
    }
}

// 步骤2：基础清理
async function processStep2(isRedo = false) {
    const fileInput = document.getElementById('imageUpload');
    let imageSource = fileInput.files[0];

    if (!imageSource && !stepResults.step2) {
        alert('请先完成步骤1');
        return;
    }

    // 显示加载状态
    document.getElementById('loading').style.display = 'block';
    document.getElementById('currentStepText').textContent = '步骤2：基础清理';
    updateStepIndicators(1);

    try {
        const formData = new FormData();
        
        // 使用原始图片或上一步的结果
        if (imageSource) {
            formData.append('image', imageSource);
        } else if (stepResults.step2) {
            formData.append('previousImageUrl', stepResults.step2);
        }
        
        formData.append('step', '2');
        // 传递杂乱物品清单
        if (clutterList) {
            formData.append('clutterList', clutterList);
        }
        // 传递是否重新清理标识
        if (isRedo) {
            formData.append('isRedo', 'true');
        }

        const response = await fetch('/api/enhance-room', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();

        // 保存步骤2结果
        stepResults.step2 = data.imageUrl;

        // 显示步骤2结果
        document.getElementById('step2ResultImage').src = data.imageUrl;
        document.getElementById('step2ResultDescription').textContent = data.description;
        document.getElementById('step2ResultContainer').style.display = 'block';
        
        // 自动进入步骤3
        setTimeout(() => {
            processStep3();
        }, 1000);
        
    } catch (error) {
        console.error('Error processing step 2:', error);
        showError('错误: ' + error.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

// 步骤3：深度整理
async function processStep3(isRedo = false) {
    if (!stepResults.step2) {
        alert('请先完成步骤2');
        return;
    }

    // 显示加载状态
    document.getElementById('loading').style.display = 'block';
    document.getElementById('currentStepText').textContent = '步骤3：深度整理';
    updateStepIndicators(2);

    try {
        const formData = new FormData();
        formData.append('previousImageUrl', stepResults.step2);
        formData.append('step', '3');
        // 传递杂乱物品清单
        if (clutterList) {
            formData.append('clutterList', clutterList);
        }
        // 传递是否重新整理标识
        if (isRedo) {
            formData.append('isRedo', 'true');
        }

        const response = await fetch('/api/enhance-room', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();

        // 保存步骤3结果
        stepResults.step3 = data.imageUrl;

        // 显示步骤3结果
        document.getElementById('step3ResultImage').src = data.imageUrl;
        document.getElementById('step3ResultDescription').textContent = data.description;
        document.getElementById('step3ResultContainer').style.display = 'block';
        
        // 自动进入步骤4
        setTimeout(() => {
            processStep4();
        }, 1000);
        
    } catch (error) {
        console.error('Error processing step 3:', error);
        showError('错误: ' + error.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

// 步骤4：布局优化
async function processStep4(isRedo = false) {
    if (!stepResults.step3) {
        alert('请先完成步骤3');
        return;
    }

    // 显示加载状态
    document.getElementById('loading').style.display = 'block';
    document.getElementById('currentStepText').textContent = '步骤4：布局优化';
    updateStepIndicators(3);

    try {
        const formData = new FormData();
        formData.append('previousImageUrl', stepResults.step3);
        formData.append('step', '4');
        // 传递杂乱物品清单
        if (clutterList) {
            formData.append('clutterList', clutterList);
        }

        const response = await fetch('/api/enhance-room', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();

        // 保存步骤4结果
        stepResults.step4 = data.imageUrl;

        // 显示步骤4结果
        document.getElementById('step4ResultImage').src = data.imageUrl;
        document.getElementById('step4ResultDescription').textContent = data.description;
        document.getElementById('step4ResultContainer').style.display = 'block';
        
        // 显示步骤5输入框
        document.getElementById('step5Section').style.display = 'block';
        document.getElementById('currentStepText').textContent = '步骤5：添加道具';
        updateStepIndicators(4);
        
    } catch (error) {
        console.error('Error processing step 4:', error);
        showError('错误: ' + error.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

// 步骤5：添加道具
async function processStep5(isRedo = false) {
    const scenarioInput = document.getElementById('scenarioInput');
    const propsInput = document.getElementById('propsInput');
    const scenario = scenarioInput.value.trim();
    const props = propsInput ? propsInput.value.trim() : '';

    if (!stepResults.step4) {
        alert('请先完成步骤4');
        return;
    }

    if (!scenario) {
        alert('请输入直播类型或场景描述');
        return;
    }

    // 显示加载状态
    document.getElementById('loading').style.display = 'block';
    document.getElementById('step5Btn').disabled = true;
    document.getElementById('currentStepText').textContent = '步骤5：添加道具（处理中）';

    try {
        const formData = new FormData();
        formData.append('previousImageUrl', stepResults.step4);
        formData.append('scenario', scenario);
        formData.append('step', '5');
        if (props) {
            formData.append('props', props);
        }
        // 传递杂乱物品清单
        if (clutterList) {
            formData.append('clutterList', clutterList);
        }

        const response = await fetch('/api/enhance-room', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();

        // 保存步骤5结果
        stepResults.step5 = data.imageUrl;

        // 显示步骤5结果
        document.getElementById('step5ResultImage').src = data.imageUrl;
        document.getElementById('step5ResultDescription').textContent = data.description;
        document.getElementById('step5ResultContainer').style.display = 'block';
        document.getElementById('step5Section').style.display = 'none';
        document.getElementById('currentStepText').textContent = '完成：五步改造已完成';
        
    } catch (error) {
        console.error('Error processing step 5:', error);
        showError('错误: ' + error.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('step5Btn').disabled = false;
    }
}

// 重新执行某个步骤（用户觉得清理不够，需要继续清理）
async function redoStep(stepNumber) {
    if (stepNumber === 1) {
        await processStep1(true); // 传递isRedo参数
    } else if (stepNumber === 2) {
        await processStep2(true); // 传递isRedo参数
    } else if (stepNumber === 3) {
        await processStep3(true); // 传递isRedo参数
    } else if (stepNumber === 4) {
        await processStep4(true); // 传递isRedo参数
    } else if (stepNumber === 5) {
        await processStep5(true); // 传递isRedo参数
    }
}

// 显示错误提示
function showError(message) {
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(239, 68, 68, 0.9);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
        z-index: 1000;
        animation: fadeIn 0.3s ease;
    `;
    errorMsg.textContent = message;
    document.body.appendChild(errorMsg);
    setTimeout(() => {
        errorMsg.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => errorMsg.remove(), 300);
    }, 3000);
}

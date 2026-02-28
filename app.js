/**
 * 这么强生成器
 * 一个纯前端图片镜像编辑工具
 */

// ========== 全局变量 ==========
let originalImage = null;
let currentImage = null; // 当前显示的图片（可能已被镜像）
let sourceCanvas, sourceCtx, resultCanvas, resultCtx;
let splitLine;
let splitPosition = 0.5; // 0-1之间
let isDragging = false;
let texts = []; // 存储添加的文字
let selectedTextIndex = -1; // 当前选中的文字索引
let isDraggingText = false; // 是否正在拖动文字
let dragOffsetX = 0; // 拖动偏移量
let dragOffsetY = 0;

// 裁切相关变量
let cropMode = false; // 是否在裁切模式
let cropRect = null; // 裁切区域 {x, y, width, height} (百分比)
let isCropping = false; // 是否正在框选
let cropStart = { x: 0, y: 0 }; // 框选起始点

// 移动端手势相关变量
let lastTap = 0; // 上次点击时间（用于双击检测）
let initialPinchDistance = 0; // 初始双指距离
let initialFontSize = 0; // 初始文字大小

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
    sourceCanvas = document.getElementById('sourceCanvas');
    sourceCtx = sourceCanvas.getContext('2d');
    resultCanvas = document.getElementById('resultCanvas');
    resultCtx = resultCanvas.getContext('2d');
    splitLine = document.getElementById('splitLine');

    initializeEventListeners();
});

// ========== 事件监听器 ==========
function initializeEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    // 上传区域点击
    uploadArea.addEventListener('click', () => fileInput.click());

    // 文件选择
    fileInput.addEventListener('change', handleFileSelect);

    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    // 分割线拖动
    splitLine.addEventListener('mousedown', startDrag);
    splitLine.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('mousemove', drag);
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);

    // 结果canvas的文字交互
    resultCanvas.addEventListener('mousedown', handleResultMouseDown);
    resultCanvas.addEventListener('touchstart', handleResultMouseDown, { passive: false });
    resultCanvas.addEventListener('mousemove', handleResultMouseMove);
    resultCanvas.addEventListener('touchmove', handleResultMouseMove, { passive: false });
    resultCanvas.addEventListener('mouseup', handleResultMouseUp);
    resultCanvas.addEventListener('touchend', handleResultMouseUp);
    resultCanvas.addEventListener('dblclick', handleResultDoubleClick);
    resultCanvas.addEventListener('wheel', scaleText);

    // 移动端双指缩放
    resultCanvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2 && selectedTextIndex !== -1) {
            initialPinchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            initialFontSize = texts[selectedTextIndex].fontSize;
        }
    });
    resultCanvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && selectedTextIndex !== -1) {
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const scale = currentDistance / initialPinchDistance;
            const textObj = texts[selectedTextIndex];
            textObj.fontSize = Math.max(10, Math.min(200, initialFontSize * scale));
            generateResult();
            e.preventDefault();
        }
    }, { passive: false });
    // 移动端双击检测
    resultCanvas.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 300 && tapLength > 0) {
                handleResultDoubleClick(e);
                e.preventDefault();
            }
            lastTap = currentTime;
        }
    });

    // 镜像按钮
    document.getElementById('mirrorBtn').addEventListener('click', () => mirrorImage(false));
    document.getElementById('verticalMirrorBtn').addEventListener('click', () => mirrorImage(true));

    // 添加文字
    document.getElementById('addTextBtn').addEventListener('click', addText);

    // 文字输入监听，控制添加按钮状态
    const textInput = document.getElementById('textInput');
    const addTextBtn = document.getElementById('addTextBtn');
    textInput.addEventListener('input', () => {
        addTextBtn.disabled = !textInput.value.trim();
    });

    // 裁切按钮
    document.getElementById('startCropBtn').addEventListener('click', toggleCropMode);
    document.getElementById('resetCropBtn').addEventListener('click', resetCrop);

    // 下载按钮
    document.getElementById('downloadBtn').addEventListener('click', downloadImage);

    // 重置按钮
    document.getElementById('resetBtn').addEventListener('click', resetEditor);

    // 清除文字按钮
    document.getElementById('clearTextBtn').addEventListener('click', clearTexts);
}

// ========== 文件处理 ==========
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件！');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            currentImage = img;
            texts = [];
            initializeEditor();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ========== 编辑器初始化 ==========
function initializeEditor() {
    document.getElementById('editorSection').classList.add('active');
    document.getElementById('uploadArea').style.display = 'none';

    // 限制canvas最大尺寸
    const maxSize = 500;
    let width = originalImage.width;
    let height = originalImage.height;

    if (width > maxSize || height > maxSize) {
        if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
        } else {
            width = (width / height) * maxSize;
            height = maxSize;
        }
    }

    sourceCanvas.width = width;
    sourceCanvas.height = height;
    resultCanvas.width = width;
    resultCanvas.height = height;

    drawSourceImage();
    updateSplitLine();
    generateResult();

    // 窗口大小改变时更新红线位置
    window.addEventListener('resize', () => {
        if (sourceCanvas) {
            updateSplitLine();
        }
    });
}

function drawSourceImage() {
    sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceCtx.drawImage(currentImage, 0, 0, sourceCanvas.width, sourceCanvas.height);
}

// ========== 分割线控制 ==========
function updateSplitLine() {
    const canvasRect = sourceCanvas.getBoundingClientRect();
    const containerRect = sourceCanvas.parentElement.getBoundingClientRect();

    // 计算 sourceCanvas 在容器中的偏移
    const offsetX = canvasRect.left - containerRect.left;
    const offsetY = canvasRect.top - containerRect.top;

    // 计算红线在容器中的位置（sourceCanvas内部尺寸 * 分割比例 + canvas偏移）
    // 减去红线宽度的一半（2px），使红线中心对齐分割点
    const x = splitPosition * canvasRect.width + offsetX - 2;

    splitLine.style.left = x + 'px';
}

function startDrag(e) {
    isDragging = true;
    if (e.type === 'touchstart') {
        e.preventDefault();
    }
}

function drag(e) {
    if (!isDragging) return;

    const canvasRect = sourceCanvas.getBoundingClientRect();

    // 获取客户端X坐标（支持触摸和鼠标）
    let clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    let x = clientX - canvasRect.left;
    x = Math.max(0, Math.min(x, canvasRect.width));

    // 基于实际显示尺寸更新分割位置
    splitPosition = x / canvasRect.width;

    updateSplitLine();
    generateResult();
}

function stopDrag() {
    isDragging = false;
}

// ========== 镜像功能 ==========
function mirrorImage(vertical) {
    if (!currentImage) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = currentImage.width;
    tempCanvas.height = currentImage.height;
    const tempCtx = tempCanvas.getContext('2d');

    if (vertical) {
        tempCtx.translate(0, tempCanvas.height);
        tempCtx.scale(1, -1);
    } else {
        tempCtx.translate(tempCanvas.width, 0);
        tempCtx.scale(-1, 1);
    }

    tempCtx.drawImage(currentImage, 0, 0);

    const newImage = new Image();
    newImage.onload = () => {
        currentImage = newImage;
        drawSourceImage();
        generateResult();
    };
    newImage.src = tempCanvas.toDataURL();
}

// ========== 生成结果图片 ==========
function generateResult() {
    if (!currentImage) return;

    // 确保分割线位置为整数，避免亚像素渲染导致的白线
    const splitX = Math.round(splitPosition * sourceCanvas.width);

    // 使用裁切区域或默认全图（只有在有裁切框且不在裁切模式时才应用）
    let cropWidth = 1, cropHeight = 1, cropX = 0, cropY = 0;

    // 只有存在有效的裁切框且不在裁切模式下才应用裁切
    if (cropRect && cropRect.width > 0.01 && cropRect.height > 0.01 && !cropMode) {
        cropWidth = cropRect.width;
        cropHeight = cropRect.height;
        cropX = cropRect.x;
        cropY = cropRect.y;
    }

    // 创建左边部分的canvas（使用整数尺寸）
    const leftPart = document.createElement('canvas');
    leftPart.width = splitX;
    leftPart.height = Math.round(sourceCanvas.height);
    const leftCtx = leftPart.getContext('2d');

    // 使用整数坐标绘制，避免抗锯齿导致的边缘问题
    leftCtx.drawImage(
        sourceCanvas,
        0, 0, splitX, sourceCanvas.height,
        0, 0, splitX, leftPart.height
    );

    // 创建镜像的左边部分
    const mirroredLeft = document.createElement('canvas');
    mirroredLeft.width = splitX;
    mirroredLeft.height = leftPart.height;
    const mirroredCtx = mirroredLeft.getContext('2d');
    mirroredCtx.translate(splitX, 0);
    mirroredCtx.scale(-1, 1);
    mirroredCtx.drawImage(leftPart, 0, 0);

    // 组合：左边 + 镜像的左边（总宽度为splitX * 2）
    const combinedWidth = splitX * 2;
    const combined = document.createElement('canvas');
    combined.width = combinedWidth;
    combined.height = leftPart.height;
    const combinedCtx = combined.getContext('2d');

    // 绘制左边部分
    combinedCtx.drawImage(leftPart, 0, 0, splitX, leftPart.height, 0, 0, splitX, leftPart.height);
    // 绘制镜像部分（从splitX位置开始）
    combinedCtx.drawImage(mirroredLeft, 0, 0, splitX, leftPart.height, splitX, 0, splitX, leftPart.height);

    // 应用裁切
    const actualCropWidth = Math.round(combinedWidth * cropWidth);
    const actualCropHeight = Math.round(leftPart.height * cropHeight);
    const actualCropX = Math.round(combinedWidth * cropX);
    const actualCropY = Math.round(leftPart.height * cropY);

    // 创建最终结果canvas（实际尺寸）
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = actualCropWidth;
    finalCanvas.height = actualCropHeight;
    const finalCtx = finalCanvas.getContext('2d');

    // 绘制裁切后的图片到最终canvas
    finalCtx.drawImage(
        combined,
        actualCropX, actualCropY, actualCropWidth, actualCropHeight,
        0, 0, actualCropWidth, actualCropHeight
    );

    // 调整resultCanvas的大小以匹配最终图片
    resultCanvas.width = actualCropWidth;
    resultCanvas.height = actualCropHeight;

    // 清除并绘制到resultCanvas
    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    resultCtx.drawImage(finalCanvas, 0, 0);

    // 添加文字（使用实际尺寸）
    drawTexts();
}

// ========== 文字功能 ==========
function addText() {
    const text = document.getElementById('textInput').value;
    if (!text) {
        return;
    }

    const fontSize = parseInt(document.getElementById('fontSizeInput').value);
    const color = document.getElementById('textColorInput').value;

    texts.push({
        text: text,
        fontSize: fontSize,
        color: color,
        x: 0.5, // 默认居中
        y: 0.5
    });

    document.getElementById('textInput').value = '';
    generateResult();
}

function drawTexts() {
    texts.forEach((textObj, index) => {
        const x = textObj.x * resultCanvas.width;
        const y = textObj.y * resultCanvas.height;

        resultCtx.save();
        resultCtx.font = `bold ${textObj.fontSize}px Arial`;
        resultCtx.fillStyle = textObj.color;
        resultCtx.textAlign = 'center';
        resultCtx.textBaseline = 'middle';

        resultCtx.fillText(textObj.text, x, y);

        // 如果是选中的文字，绘制选中框
        if (index === selectedTextIndex) {
            const metrics = resultCtx.measureText(textObj.text);
            const textWidth = metrics.width;
            const textHeight = textObj.fontSize;

            resultCtx.strokeStyle = '#00ff00';
            resultCtx.lineWidth = 2;
            resultCtx.setLineDash([5, 5]);
            resultCtx.strokeRect(
                x - textWidth / 2 - 5,
                y - textHeight / 2 - 5,
                textWidth + 10,
                textHeight + 10
            );
            resultCtx.setLineDash([]);
        }

        resultCtx.restore();
    });

    // 绘制裁切框（仅在裁切模式下显示预览）
    if (cropRect && cropMode) {
        resultCtx.save();
        resultCtx.strokeStyle = '#ff6b6b';
        resultCtx.lineWidth = 3;
        resultCtx.setLineDash([10, 5]);

        const x = cropRect.x * resultCanvas.width;
        const y = cropRect.y * resultCanvas.height;
        const w = cropRect.width * resultCanvas.width;
        const h = cropRect.height * resultCanvas.height;

        resultCtx.strokeRect(x, y, w, h);

        // 绘制半透明遮罩（非裁切区域）
        resultCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        // 上
        resultCtx.fillRect(0, 0, resultCanvas.width, y);
        // 下
        resultCtx.fillRect(0, y + h, resultCanvas.width, Math.max(0, resultCanvas.height - y - h));
        // 左
        resultCtx.fillRect(0, y, x, h);
        // 右
        resultCtx.fillRect(x + w, y, Math.max(0, resultCanvas.width - x - w), h);

        resultCtx.restore();
    }
}

// ========== 文字交互 ==========
function getTextAtPosition(mouseX, mouseY) {
    const rect = resultCanvas.getBoundingClientRect();
    const scaleX = resultCanvas.width / rect.width;
    const scaleY = resultCanvas.height / rect.height;

    // 转换鼠标坐标到实际canvas坐标
    const actualX = mouseX * scaleX;
    const actualY = mouseY * scaleY;

    for (let i = texts.length - 1; i >= 0; i--) {
        const textObj = texts[i];
        const x = textObj.x * resultCanvas.width;
        const y = textObj.y * resultCanvas.height;

        resultCtx.font = `bold ${textObj.fontSize}px Arial`;
        const metrics = resultCtx.measureText(textObj.text);
        const textWidth = metrics.width;
        const textHeight = textObj.fontSize;

        if (
            actualX >= x - textWidth / 2 &&
            actualX <= x + textWidth / 2 &&
            actualY >= y - textHeight / 2 &&
            actualY <= y + textHeight / 2
        ) {
            return i;
        }
    }
    return -1;
}

// 辅助函数：获取事件的客户端坐标（支持触摸和鼠标）
function getEventCoords(e) {
    if (e.type.includes('touch')) {
        const touch = e.touches[0] || e.changedTouches[0];
        return { x: touch.clientX, y: touch.clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

function startTextDrag(e) {
    const rect = resultCanvas.getBoundingClientRect();
    const coords = getEventCoords(e);
    const mouseX = coords.x - rect.left;
    const mouseY = coords.y - rect.top;

    // 获取缩放比例
    const scaleX = resultCanvas.width / rect.width;
    const scaleY = resultCanvas.height / rect.height;

    selectedTextIndex = getTextAtPosition(mouseX, mouseY);

    if (selectedTextIndex !== -1) {
        isDraggingText = true;
        const textObj = texts[selectedTextIndex];
        dragOffsetX = (mouseX * scaleX) - textObj.x * resultCanvas.width;
        dragOffsetY = (mouseY * scaleY) - textObj.y * resultCanvas.height;
        resultCanvas.style.cursor = 'move';
    }

    // 总是重新生成以更新选中框显示
    generateResult();
}

function dragText(e) {
    const rect = resultCanvas.getBoundingClientRect();
    const coords = getEventCoords(e);
    const mouseX = coords.x - rect.left;
    const mouseY = coords.y - rect.top;

    // 获取缩放比例
    const scaleX = resultCanvas.width / rect.width;
    const scaleY = resultCanvas.height / rect.height;

    if (isDraggingText && selectedTextIndex !== -1) {
        const textObj = texts[selectedTextIndex];
        textObj.x = ((mouseX * scaleX) - dragOffsetX) / resultCanvas.width;
        textObj.y = ((mouseY * scaleY) - dragOffsetY) / resultCanvas.height;

        // 限制在canvas范围内
        textObj.x = Math.max(0, Math.min(1, textObj.x));
        textObj.y = Math.max(0, Math.min(1, textObj.y));

        generateResult();
    } else {
        // 悬停效果（仅限鼠标）
        if (!e.type.includes('touch')) {
            const hoverIndex = getTextAtPosition(mouseX, mouseY);
            resultCanvas.style.cursor = hoverIndex !== -1 ? 'move' : 'default';
        }
    }
}

function stopTextDrag() {
    isDraggingText = false;
    resultCanvas.style.cursor = 'default';
}

function deleteText(e) {
    const rect = resultCanvas.getBoundingClientRect();
    const coords = getEventCoords(e);
    const mouseX = coords.x - rect.left;
    const mouseY = coords.y - rect.top;

    const textIndex = getTextAtPosition(mouseX, mouseY);
    if (textIndex !== -1) {
        texts.splice(textIndex, 1);
        selectedTextIndex = -1;
        generateResult();
    }
}

function scaleText(e) {
    if (selectedTextIndex === -1) return;

    e.preventDefault();
    const textObj = texts[selectedTextIndex];
    const delta = e.deltaY > 0 ? -2 : 2;

    textObj.fontSize = Math.max(10, Math.min(200, textObj.fontSize + delta));
    generateResult();
}

// ========== 裁切功能 ==========
function toggleCropMode() {
    cropMode = !cropMode;
    const btn = document.getElementById('startCropBtn');
    const hint = document.getElementById('cropHint');

    if (cropMode) {
        btn.textContent = '完成裁切';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
        hint.style.display = 'block';
        selectedTextIndex = -1; // 清除文字选中
    } else {
        btn.textContent = '开始裁切';
        btn.classList.remove('btn-success');
        btn.classList.add('btn-primary');
        hint.style.display = 'none';
    }
    generateResult();
}

function resetCrop() {
    cropRect = null;
    cropMode = false;
    document.getElementById('startCropBtn').textContent = '开始裁切';
    document.getElementById('startCropBtn').classList.remove('btn-success');
    document.getElementById('startCropBtn').classList.add('btn-primary');
    document.getElementById('cropHint').style.display = 'none';
    generateResult();
}

function startCropSelection(e) {
    const rect = resultCanvas.getBoundingClientRect();
    const coords = getEventCoords(e);
    const mouseX = coords.x - rect.left;
    const mouseY = coords.y - rect.top;

    // 获取缩放比例
    const scaleX = resultCanvas.width / rect.width;
    const scaleY = resultCanvas.height / rect.height;

    isCropping = true;
    cropStart = {
        x: (mouseX * scaleX) / resultCanvas.width,
        y: (mouseY * scaleY) / resultCanvas.height
    };
    cropRect = {
        x: cropStart.x,
        y: cropStart.y,
        width: 0,
        height: 0
    };
}

function dragCropSelection(e) {
    if (!isCropping || !cropMode) return;

    const rect = resultCanvas.getBoundingClientRect();
    const coords = getEventCoords(e);
    const mouseX = coords.x - rect.left;
    const mouseY = coords.y - rect.top;

    // 获取缩放比例
    const scaleX = resultCanvas.width / rect.width;
    const scaleY = resultCanvas.height / rect.height;

    const currentX = (mouseX * scaleX) / resultCanvas.width;
    const currentY = (mouseY * scaleY) / resultCanvas.height;

    // 计算裁切矩形
    const x = Math.min(cropStart.x, currentX);
    const y = Math.min(cropStart.y, currentY);
    const width = Math.abs(currentX - cropStart.x);
    const height = Math.abs(currentY - cropStart.y);

    cropRect = { x, y, width, height };
    generateResult();
}

function stopCropSelection() {
    isCropping = false;
    // 如果裁切区域太小，清除它
    if (cropRect && (cropRect.width < 0.01 || cropRect.height < 0.01)) {
        cropRect = null;
        generateResult();
    }
}

// ========== 统一事件处理 ==========
function handleResultMouseDown(e) {
    if (cropMode) {
        startCropSelection(e);
    } else {
        startTextDrag(e);
    }
}

function handleResultMouseMove(e) {
    if (cropMode) {
        dragCropSelection(e);
    } else {
        dragText(e);
    }
}

function handleResultMouseUp(e) {
    if (cropMode) {
        stopCropSelection();
    } else {
        stopTextDrag();
    }
}

function handleResultDoubleClick(e) {
    if (cropMode) {
        // 裁切模式下双击清除裁切框
        cropRect = null;
        generateResult();
    } else {
        deleteText(e);
    }
}

// ========== 操作功能 ==========
function clearTexts() {
    texts = [];
    selectedTextIndex = -1;
    generateResult();
}

function downloadImage() {
    // 保存当前选中状态
    const tempSelectedIndex = selectedTextIndex;
    // 清除选中状态以避免导出选择框
    selectedTextIndex = -1;
    // 重新绘制不带选择框的图片
    generateResult();

    // 延迟一点执行下载，确保重绘完成
    setTimeout(() => {
        const link = document.createElement('a');
        link.download = 'sostrong_' + Date.now() + '.png';
        link.href = resultCanvas.toDataURL('image/png');
        link.click();

        // 恢复选中状态
        selectedTextIndex = tempSelectedIndex;
        generateResult();
    }, 100);
}

function resetEditor() {
    if (!originalImage) return;

    currentImage = originalImage;
    texts = [];
    selectedTextIndex = -1;
    splitPosition = 0.5;
    cropRect = null;
    cropMode = false;

    // 重置裁切按钮状态
    document.getElementById('startCropBtn').textContent = '开始裁切';
    document.getElementById('startCropBtn').classList.remove('btn-success');
    document.getElementById('startCropBtn').classList.add('btn-primary');
    document.getElementById('cropHint').style.display = 'none';

    drawSourceImage();
    updateSplitLine();
    generateResult();
}

const ctx = document.getElementById('myChart').getContext('2d');
let maxDataPoints = 100; // 修改为 let 以便后续修改
const maxDataPointsInput = document.getElementById('max-data-points');
maxDataPointsInput.value = maxDataPoints;

const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');

function updateStatusIndicator() {
    if (isPaused) {
        statusIndicator.style.backgroundColor = 'red';
        statusText.textContent = '暂停';
    } else if (selection.isSelecting) {
        statusIndicator.style.backgroundColor = 'blue'; // 选择模式时显示蓝色
        statusText.textContent = '选择模式';
    } else {
        statusIndicator.style.backgroundColor = 'green';
        statusText.textContent = '正常';
    }
}

maxDataPointsInput.addEventListener('change', function () {
    const newValue = parseInt(this.value, 10);
    if (!isNaN(newValue) && newValue > 0) {
        maxDataPoints = newValue;
        updateChart(); // 调整图表而不清空数据
    }
    updateStatusIndicator();
});

const myChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: []
    },
    options: {
        scales: {
            x: {
                type: 'linear',
                position: 'bottom',
                ticks: {
                    maxTicksLimit: maxDataPoints
                }
            },
            y: {
                beginAtZero: true,
            }
        },
        plugins: {
            legend: {
                display: false
            },
            zoom: {
                pan: {
                    enabled: true,
                    mode: 'x',
                },
                zoom: {
                    wheel: {
                        enabled: true,
                    },
                    mode: 'x',
                    onZoomComplete: function () {
                        updateYAxisRange();
                    }
                }
            }
        }
    }
});

const liveStatus = document.getElementById('live-status');

function updateLiveStatus(isConnected) {
    if (isConnected) {
        liveStatus.classList.add('live');
    } else {
        liveStatus.classList.remove('live');
        liveStatus.style.backgroundColor = 'gray';
    }
}

const eventSource = new EventSource('/events');
const bufferSize = 50;
let animationFrameId;
let isUserPanning = false;
let isPaused = false;

function generateFileName() {
    const date_time = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    return "saved_data_" + date_time + ".txt";
}

function resetChart() {
    isPaused = false;
    myChart.data.labels = [];
    myChart.data.datasets.forEach(dataset => {
        dataset.data = [];
    });
    myChart.options.scales.x.min = 0; // 恢复至0点
    myChart.options.scales.x.max = maxDataPoints; // 恢复至初始状态
    myChart.resetZoom(); // 恢复至初始状态
    myChart.update('none');
    updateDataPoints(); // 重置统计信息
    console.log('Chart reset');
}

const saveDataButton = document.getElementById('save-data');
saveDataButton.addEventListener('click', function () {
    saveAllDataToFile();
});

function saveAllDataToFile() {
    if (myChart.data.labels.length === 0) {
        console.error('No data to save');
        return;
    }
    fetch('/download')
        .then(response => response.text())
        .then(data => {
            if (data === 'No data') {
                console.error('No data to save');
                return;
            }
            const blob = new Blob([data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = generateFileName();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        })
        .catch(error => console.error('Error downloading data:', error));
}

eventSource.onmessage = function (event) {
    if (event.data === 'reset') {
        resetChart();
        return;
    }

    const dataArray = JSON.parse(event.data);
    dataArray.forEach(data => {
        const xys = data.split(' ').map(parseFloat);
        const x = xys[0];
        if (isNaN(x)) {
            console.error('Invalid data:', data);
            return;
        }
        for (let i = 1; i < xys.length; i++) {
            const y = xys[i];
            if (isNaN(y)) {
                console.error('Invalid y:', y);
                continue;
            }
            if (!myChart.data.datasets[i - 1]) {
                myChart.data.datasets.push({
                    label: `Y${i}`,
                    data: [],
                    borderColor: `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 1)`,
                    borderWidth: 1,
                    fill: false
                });
            }
            myChart.data.datasets[i - 1].data.push({ x, y });
        }
        myChart.data.labels.push(x);
    });
    if (!animationFrameId && !isUserPanning && !isPaused) {
        animationFrameId = requestAnimationFrame(updateChart);
    }
    updateDataPoints();
};

function updateChart() {
    const totalDataPoints = myChart.data.labels.length;
    const viewDataLength = Math.min(myChart.data.labels.length, maxDataPoints);
    const start = totalDataPoints - viewDataLength;
    myChart.options.scales.x.min = myChart.data.labels[start];
    myChart.options.scales.x.max = myChart.data.labels[totalDataPoints - 1];
    console.log('Updating chart:', myChart.options.scales.x.min, myChart.options.scales.x.max);

    myChart.update('none');
    updateYAxisRange(); // 确保在更新图表数据后调用
    animationFrameId = null;
}

const closeOnDisconnectCheckbox = document.getElementById('close-on-disconnect');

eventSource.onopen = function () {
    updateLiveStatus(true);
};

eventSource.onerror = function (error) {
    console.log('EventSource error:', error);
    updateLiveStatus(false);
    // close the connection
    eventSource.close();
    if (closeOnDisconnectCheckbox.checked) {
        window.close();
    }
};

// 添加键盘事件监听器
let selection = {
    isSelecting: false,
    start: null,
    end: null,
    data: []
};

document.addEventListener('keydown', function (event) {
    if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') {
        myChart.pan({ x: 50, y: 0 });
        updateYAxisRange();
    } else if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') {
        myChart.pan({ x: -50, y: 0 });
        updateYAxisRange();
    } else if (event.key === 'r' || event.key === 'R') {
        isPaused = false;
        let scaleXMin = myChart.options.scales.x.min;
        let scaleXMax = myChart.options.scales.x.max;
        if (scaleXMin < myChart.data.labels[0]) {
            scaleXMin = myChart.data.labels[0];
            scaleXMax = scaleXMin + maxDataPoints;
        }
        if (scaleXMax > myChart.data.labels[myChart.data.labels.length - 1]) {
            scaleXMax = myChart.data.labels[myChart.data.labels.length - 1];
            scaleXMin = scaleXMax - maxDataPoints;
        }
        const scaleXMid = (scaleXMin + scaleXMax) / 2;
        myChart.options.scales.x.min = scaleXMid - maxDataPoints / 2;
        myChart.options.scales.x.max = scaleXMid + maxDataPoints / 2;
        myChart.update('none');
        updateYAxisRange();
    } else if (event.key === 'p' || event.key === 'P') {
        isPaused = !isPaused;
        if (!isPaused) {
            animationFrameId = requestAnimationFrame(updateChart);
        }
    } else if ((event.key === 'z' || event.key === 'Z') && !selection.isSelecting) {
        selection.isSelecting = true;
        selection.start = null;
        selection.end = null;
        selection.data = [];
    } else if (event.ctrlKey && event.key === 'c') {
        fetch('/shutdown', { method: 'POST' })
            .then(() => window.close())
            .catch(err => console.error('Error shutting down server:', err));
    }
    updateStatusIndicator();
});

document.addEventListener('keyup', function (event) {
    if (event.key === 'z' || event.key === 'Z') {
        selection.isSelecting = false;
        selection.start = null;
        selection.end = null;
        selection.data = [];
        maxY = undefined;
        minY = undefined;
        avgY = undefined;
        sigma1 = undefined;
        sigma2 = undefined;
        sigma3 = undefined;
        myChart.data.datasets = myChart.data.datasets.filter(dataset =>
            dataset.label !== 'Selection' &&
            dataset.label !== 'Max Line' &&
            dataset.label !== 'Min Line' &&
            dataset.label !== 'Avg Line' &&
            dataset.label !== '1σ Range' &&
            dataset.label !== '2σ Range' &&
            dataset.label !== '3σ Range'
        );
        myChart.update('none');
    }
    updateStatusIndicator();
});

let isDragging = false;
let startX;

let selectionMask = {
    isVisible: false,
    startX: null,
    endX: null,
    draw: function (ctx) {
        if (this.isVisible && this.startX !== null && this.endX !== null) {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
            ctx.fillRect(this.startX, 0, this.endX - this.startX, ctx.canvas.height);
            ctx.restore();
        }
    }
};

ctx.canvas.addEventListener('mousedown', function (event) {
    isDragging = true;
    startX = event.clientX;
    isUserPanning = true;

    if (selection.isSelecting) {
        const rect = ctx.canvas.getBoundingClientRect();
        const scaleX = ctx.canvas.width / rect.width;
        const mouseX = (event.clientX - rect.left) * scaleX;
        selection.start = myChart.scales.x.getValueForPixel(mouseX);
        selectionMask.startX = mouseX;
        selectionMask.isVisible = true;
        isDragging = false; // 禁止图表移动
    }
});

ctx.canvas.addEventListener('mousemove', function (event) {
    if (isDragging && !selection.isSelecting) {
        const deltaX = event.clientX - startX;
        myChart.pan({ x: deltaX, y: 0 });
        startX = event.clientX;

        // 更新Y轴范围
        updateYAxisRange();
    }

    if (selection.isSelecting && selectionMask.isVisible) {
        const rect = ctx.canvas.getBoundingClientRect();
        const scaleX = ctx.canvas.width / rect.width;
        const mouseX = (event.clientX - rect.left) * scaleX;
        selectionMask.endX = mouseX;
        myChart.draw();
    }

    const rect = ctx.canvas.getBoundingClientRect();
    const scaleX = ctx.canvas.width / rect.width;
    const scaleY = ctx.canvas.height / rect.height;
    const mouseX = (event.clientX - rect.left) * scaleX;
    const mouseY = (event.clientY - rect.top) * scaleY;

    crosshair.x = mouseX;
    crosshair.y = mouseY;

    mouseCoordinatesDisplay.textContent = `Mouse coordinates: (${mouseX.toFixed(2)}, ${mouseY.toFixed(2)})`;
    myChart.draw();
});

let maxY, minY, avgY;
let sigma1, sigma2, sigma3;

ctx.canvas.addEventListener('mouseup', function (event) {
    isDragging = false;
    isUserPanning = false;
    updateYAxisRange();

    if (selection.isSelecting && selection.start !== null) {
        const rect = ctx.canvas.getBoundingClientRect();
        const scaleX = ctx.canvas.width / rect.width;
        const mouseX = (event.clientX - rect.left) * scaleX;
        selection.end = myChart.scales.x.getValueForPixel(mouseX);
        selectionMask.endX = mouseX;
        selectionMask.isVisible = false;

        if (selection.start > selection.end) {
            [selection.start, selection.end] = [selection.end, selection.start];
        }

        selection.data = myChart.data.datasets.flatMap(dataset =>
            dataset.data.filter((point, index) => {
                const xValue = myChart.data.labels[index];
                return xValue >= selection.start && xValue <= selection.end;
            })
        );

        if (selection.data.length > 0) {
            minY = Math.min(...selection.data.map(point => point.y));
            maxY = Math.max(...selection.data.map(point => point.y));
            avgY = selection.data.reduce((sum, point) => sum + point.y, 0) / selection.data.length;

            // 添加最大值线
            myChart.data.datasets = myChart.data.datasets.filter(dataset =>
                dataset.label !== 'Max Line' &&
                dataset.label !== 'Min Line' &&
                dataset.label !== 'Avg Line' &&
                dataset.label !== '1σ Range' &&
                dataset.label !== '2σ Range' &&
                dataset.label !== '3σ Range'
            );

            myChart.data.datasets.push({
                label: 'Max Line',
                data: [
                    { x: selection.start, y: maxY },
                    { x: selection.end, y: maxY }
                ],
                borderColor: 'rgba(255, 0, 0, 0.8)',
                borderWidth: 2,
                fill: false,
                pointRadius: 0
            });

            // 添加最小值线
            myChart.data.datasets.push({
                label: 'Min Line',
                data: [
                    { x: selection.start, y: minY },
                    { x: selection.end, y: minY }
                ],
                borderColor: 'rgba(0, 0, 255, 0.8)',
                borderWidth: 2,
                fill: false,
                pointRadius: 0
            });

            // 添加平均值线
            myChart.data.datasets.push({
                label: 'Avg Line',
                data: [
                    { x: selection.start, y: avgY },
                    { x: selection.end, y: avgY }
                ],
                borderColor: 'rgba(0, 255, 0, 0.8)',
                borderWidth: 2,
                fill: false,
                pointRadius: 0
            });

            const mean = avgY;
            const variance = selection.data.reduce((sum, point) => sum + Math.pow(point.y - mean, 2), 0) / selection.data.length;
            const stdDev = Math.sqrt(variance);
            sigma1 = [mean - stdDev, mean + stdDev];
            sigma2 = [mean - 2 * stdDev, mean + 2 * stdDev];
            sigma3 = [mean - 3 * stdDev, mean + 3 * stdDev];

            // 添加1sigma范围
            myChart.data.datasets.push({
                label: '1σ Range',
                data: [
                    { x: selection.start, y: sigma1[0] },
                    { x: selection.end, y: sigma1[0] },
                    { x: selection.end, y: sigma1[1] },
                    { x: selection.start, y: sigma1[1] }
                ],
                backgroundColor: 'rgba(0, 255, 0, 0.2)', // 绿色
                borderWidth: 0,
                fill: true,
                pointRadius: 0
            });

            // 添加2sigma范围
            myChart.data.datasets.push({
                label: '2σ Range',
                data: [
                    { x: selection.start, y: sigma2[0] },
                    { x: selection.end, y: sigma2[0] },
                    { x: selection.end, y: sigma2[1] },
                    { x: selection.start, y: sigma2[1] }
                ],
                backgroundColor: 'rgba(255, 165, 0, 0.2)', // 橙色
                borderWidth: 0,
                fill: true,
                pointRadius: 0
            });

            // 添加3sigma范围
            myChart.data.datasets.push({
                label: '3σ Range',
                data: [
                    { x: selection.start, y: sigma3[0] },
                    { x: selection.end, y: sigma3[0] },
                    { x: selection.end, y: sigma3[1] },
                    { x: selection.start, y: sigma3[1] }
                ],
                backgroundColor: 'rgba(255, 0, 0, 0.2)', // 红色
                borderWidth: 0,
                fill: true,
                pointRadius: 0
            });

            myChart.update('none');
        }
    }
});

ctx.canvas.addEventListener('mouseleave', function () {
    isDragging = false;
    isUserPanning = false;
    updateYAxisRange();

    crosshair.x = null;
    crosshair.y = null;
    mouseCoordinatesDisplay.textContent = `Mouse coordinates: (0, 0)`;
    myChart.draw();
});

// 内存占用显示逻辑
function updateMemoryUsage() {
    const memoryUsage = window.performance.memory;
    const usedJSHeapSize = memoryUsage.usedJSHeapSize / 1024 / 1024; // 转换为MB
    document.getElementById('memory-usage').textContent = `Memory usage: ${usedJSHeapSize.toFixed(2)} MB`;
}

setInterval(updateMemoryUsage, 1000); // 每秒更新一次内存占用

// 数据点数显示逻辑
function updateDataPoints() {
    const totalDataPoints = myChart.data.labels.length;
    document.getElementById('data-points').textContent = `Total data points: ${totalDataPoints}`;
}

// CPU 使用率显示逻辑
function updateCPUUsage() {
    const cpuUsage = window.performance.now();
    document.getElementById('cpu-usage').textContent = `CPU usage: ${cpuUsage.toFixed(2)} ms`;
}

setInterval(updateCPUUsage, 1000); // 每秒更新一次 CPU 使用率

function updateYAxisRange() {
    const start = myChart.options.scales.x.min;
    const end = myChart.options.scales.x.max;
    const visibleData = myChart.data.datasets.flatMap(dataset =>
        dataset.data.filter((point, index) => {
            const xValue = myChart.data.labels[index];
            return xValue >= start && xValue <= end;
        })
    );
    if (visibleData.length === 0) {
        myChart.options.scales.y.min = 0;
        myChart.options.scales.y.max = 1;
    } else {
        const minY = Math.min(...visibleData.map(point => point.y));
        const maxY = Math.max(...visibleData.map(point => point.y));
        const gap = maxY - minY;
        let padding = (maxY - minY) * 0.05; // 预留5%的空余
        if (padding === 0) {
            padding = maxY * 0.05; // 如果最大值和最小值相等，则预留5%的空余
        }
        myChart.options.scales.y.min = minY - padding;
        myChart.options.scales.y.max = maxY + padding;
        if (gap >= 5) {
            myChart.options.scales.y.min = Math.floor(myChart.options.scales.y.min);
            myChart.options.scales.y.max = Math.ceil(myChart.options.scales.y.max);
        }
    }
    myChart.update('none');
}

const crosshair = {
    x: null,
    y: null,
    draw: function (ctx) {
        if (this.x !== null && this.y !== null) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(this.x, 0);
            ctx.lineTo(this.x, ctx.canvas.height);
            ctx.moveTo(0, this.y);
            ctx.lineTo(ctx.canvas.width, this.y);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // 显示 x 坐标
            ctx.fillStyle = 'black';
            ctx.font = '12px Arial';
            const xValue = myChart.scales.x.getValueForPixel(this.x).toFixed(2);
            ctx.fillText(`x: ${xValue}`, this.x + 5, 12);

            // 显示 y 坐标
            const yValue = myChart.scales.y.getValueForPixel(this.y).toFixed(2);
            ctx.fillText(`y: ${yValue}`, ctx.canvas.width - ctx.measureText(`y: ${yValue}`).width - 5, this.y - 5);

            ctx.restore();
        }
    }
};

const mouseCoordinatesDisplay = document.getElementById('mouse-coordinates');

ctx.canvas.addEventListener('mousemove', function (event) {
    const rect = ctx.canvas.getBoundingClientRect();
    const scaleX = ctx.canvas.width / rect.width;
    const scaleY = ctx.canvas.height / rect.height;
    const mouseX = (event.clientX - rect.left) * scaleX;
    const mouseY = (event.clientY - rect.top) * scaleY;

    const xValue = myChart.scales.x.getValueForPixel(mouseX);
    const yValue = myChart.scales.y.getValueForPixel(mouseY);

    crosshair.x = mouseX;
    crosshair.y = mouseY;

    mouseCoordinatesDisplay.textContent = `Mouse coordinates: (${xValue.toFixed(2)}, ${yValue.toFixed(2)})`;
    myChart.draw();
});

ctx.canvas.addEventListener('mouseleave', function () {
    crosshair.x = null;
    crosshair.y = null;
    mouseCoordinatesDisplay.textContent = `Mouse coordinates: (0, 0)`;
    myChart.draw();
});

Chart.register({
    id: 'crosshair',
    afterDraw: function (chart) {
        crosshair.draw(chart.ctx);
        selectionMask.draw(chart.ctx);

        if (maxY !== undefined && minY !== undefined && avgY !== undefined) {
            const ctx = chart.ctx;
            ctx.save();
            ctx.fillStyle = 'black';
            ctx.font = '12px Arial';
            ctx.fillText(`Max: ${maxY.toFixed(2)}`, chart.scales.x.getPixelForValue(selection.end) + 5, chart.scales.y.getPixelForValue(maxY));
            ctx.fillStyle = 'black';
            ctx.fillText(`Min: ${minY.toFixed(2)}`, chart.scales.x.getPixelForValue(selection.end) + 5, chart.scales.y.getPixelForValue(minY));
            ctx.fillStyle = 'black';
            ctx.fillText(`Avg: ${avgY.toFixed(2)}`, chart.scales.x.getPixelForValue(selection.end) + 5, chart.scales.y.getPixelForValue(avgY));
            if (sigma1 && sigma2 && sigma3) {
                console.log(sigma1, sigma2, sigma3);
                ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'; // 绿色
                ctx.fillRect(chart.scales.x.getPixelForValue(selection.start), chart.scales.y.getPixelForValue(sigma1[0]), chart.scales.x.getPixelForValue(selection.end) - chart.scales.x.getPixelForValue(selection.start), chart.scales.y.getPixelForValue(sigma1[1]) - chart.scales.y.getPixelForValue(sigma1[0]));
                ctx.fillStyle = 'black';
                ctx.fillText('1σ', chart.scales.x.getPixelForValue(selection.start) - 25, chart.scales.y.getPixelForValue(sigma1[1]));
                ctx.fillText('1σ', chart.scales.x.getPixelForValue(selection.start) - 25, chart.scales.y.getPixelForValue(sigma1[0]));

                ctx.fillStyle = 'rgba(255, 165, 0, 0.2)'; // 橙色
                ctx.fillRect(chart.scales.x.getPixelForValue(selection.start), chart.scales.y.getPixelForValue(sigma2[0]), chart.scales.x.getPixelForValue(selection.end) - chart.scales.x.getPixelForValue(selection.start), chart.scales.y.getPixelForValue(sigma2[1]) - chart.scales.y.getPixelForValue(sigma2[0]));
                ctx.fillStyle = 'black';
                ctx.fillText('2σ', chart.scales.x.getPixelForValue(selection.start) - 25, chart.scales.y.getPixelForValue(sigma2[1]));
                ctx.fillText('2σ', chart.scales.x.getPixelForValue(selection.start) - 25, chart.scales.y.getPixelForValue(sigma2[0]));

                ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'; // 红色
                ctx.fillRect(chart.scales.x.getPixelForValue(selection.start), chart.scales.y.getPixelForValue(sigma3[0]), chart.scales.x.getPixelForValue(selection.end) - chart.scales.x.getPixelForValue(selection.start), chart.scales.y.getPixelForValue(sigma3[1]) - chart.scales.y.getPixelForValue(sigma3[0]));
                ctx.fillStyle = 'black';
                ctx.fillText('3σ', chart.scales.x.getPixelForValue(selection.start) - 25, chart.scales.y.getPixelForValue(sigma3[1]));
                ctx.fillText('3σ', chart.scales.x.getPixelForValue(selection.start) - 25, chart.scales.y.getPixelForValue(sigma3[0]));
            }
            ctx.restore();
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const closeOnDisconnectCheckbox = document.getElementById('close-on-disconnect');
    const savedCloseOnDisconnectState = localStorage.getItem('closeOnDisconnect');
    if (savedCloseOnDisconnectState !== null) {
        closeOnDisconnectCheckbox.checked = JSON.parse(savedCloseOnDisconnectState);
    }

    closeOnDisconnectCheckbox.addEventListener('change', () => {
        localStorage.setItem('closeOnDisconnect', closeOnDisconnectCheckbox.checked);
    });

    const drawModeSelect = document.getElementById('draw-mode');
    const savedDrawMode = localStorage.getItem('drawMode');
    if (savedDrawMode !== null) {
        drawModeSelect.value = savedDrawMode;
        myChart.config.type = savedDrawMode;
        myChart.update();
    }

    drawModeSelect.addEventListener('change', () => {
        const selectedMode = drawModeSelect.value;
        localStorage.setItem('drawMode', selectedMode);
        myChart.config.type = selectedMode;
        myChart.update();
    });

    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.key === 'c') {
            fetch('/shutdown', { method: 'POST' })
                .then(() => window.close())
                .catch(err => console.error('Error shutting down server:', err));
        }
    });
});

const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', handleFile);
dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragover');
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        handleFile({ target: { files } });
    }
});

function handleFile(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result;
            const data = parseFileContent(content);
            renderData(data);
        };
        reader.readAsText(file);
    }
}

function parseFileContent(content) {
    const lines = content.split('\n');
    return lines.map(line => {
        const [x, y] = line.split(' ').map(parseFloat);
        return { x, y };
    }).filter(point => !isNaN(point.x) && !isNaN(point.y));
}

function renderData(data) {
    myChart.data.labels = data.map(point => point.x);
    myChart.data.datasets.forEach(dataset => {
        dataset.data = [];
    });
    data.forEach(point => {
        for (let i = 1; i < point.length; i++) {
            if (!myChart.data.datasets[i - 1]) {
                myChart.data.datasets.push({
                    label: `Y${i}`,
                    data: [],
                    borderColor: `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 1)`,
                    borderWidth: 1,
                    fill: false
                });
            }
            myChart.data.datasets[i - 1].data.push({ x: point.x, y: point[`y${i}`] });
        }
    });
    updateChart();
}

const drawModeCheckbox = document.getElementById('draw-mode');
let isDrawMode = false;

drawModeCheckbox.addEventListener('change', function () {
    isDrawMode = this.checked;
    if (isDrawMode) {
        myChart.config.type = 'scatter';
    } else {
        myChart.config.type = 'line';
    }
    myChart.update();
});

const drawModeSelect = document.getElementById('draw-mode');

drawModeSelect.addEventListener('change', function () {
    const selectedMode = this.value;
    myChart.config.type = selectedMode;
    myChart.update();
});

// ctx.canvas.addEventListener('click', function (event) {
//     if (drawModeSelect.value === 'scatter') {
//         const rect = ctx.canvas.getBoundingClientRect();
//         const scaleX = ctx.canvas.width / rect.width;
//         const scaleY = ctx.canvas.height / rect.height;
//         const mouseX = (event.clientX - rect.left) * scaleX;
//         const mouseY = (event.clientY - rect.top) * scaleY;
//         const xValue = myChart.scales.x.getValueForPixel(mouseX);
//         const yValue = myChart.scales.y.getValueForPixel(mouseY);
//         myChart.data.labels.push(xValue);
//         myChart.data.datasets[0].data.push({ x: xValue, y: yValue });
//         myChart.update();
//     }
// });

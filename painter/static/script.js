const ctx = document.getElementById('myChart').getContext('2d');
let maxDataPoints = 100; // 修改为 let 以便后续修改
const maxDataPointsInput = document.getElementById('max-data-points');
maxDataPointsInput.value = maxDataPoints;

const statusDisplay = document.getElementById('status-display');

function updateStatusDisplay() {
    const statusLight = document.getElementById('status-light');
    if (isPaused) {
        statusLight.style.backgroundColor = 'red';
    } else if (selection.isSelecting) {
        statusLight.style.backgroundColor = 'blue'; // 选择模式时显示蓝色
    } else {
        statusLight.style.backgroundColor = 'green';
    }
}

maxDataPointsInput.addEventListener('change', function () {
    const newValue = parseInt(this.value, 10);
    if (!isNaN(newValue) && newValue > 0) {
        maxDataPoints = newValue;
        updateChart(); // 调整图表而不清空数据
    }
    updateStatusDisplay();
});

const myChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            data: [],
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
            fill: false
        }]
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

const eventSource = new EventSource('/events');
const bufferSize = 50;
let animationFrameId;
let isUserPanning = false;
let isPaused = false;

function resetChart() {
    isPaused = false;
    myChart.data.labels = [];
    myChart.data.datasets[0].data = [];
    myChart.options.scales.x.min = 0; // 恢复至0点
    myChart.options.scales.x.max = maxDataPoints; // 恢复至初始状态
    myChart.resetZoom(); // 恢复至初始状态
    myChart.update('none');
    updateDataPoints(); // 重置统计信息
    console.log('Chart reset');
}

eventSource.onmessage = function (event) {
    if (event.data === 'reset') {
        resetChart();
        return;
    }

    const dataArray = JSON.parse(event.data);
    dataArray.forEach(data => {
        const [x, y] = data.split(' ').map(parseFloat);
        if (!isNaN(x) && !isNaN(y)) {
            myChart.data.labels.push(x);
            myChart.data.datasets[0].data.push(y);
        }
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

    myChart.update('none');
    updateYAxisRange(); // 确保在更新图表数据后调用
    animationFrameId = null;
}

eventSource.onerror = function (error) {
    console.log('EventSource error:', error);
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
    }
    updateStatusDisplay();
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
    updateStatusDisplay();
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

    const xValue = myChart.scales.x.getValueForPixel(mouseX);
    const yValue = myChart.scales.y.getValueForPixel(mouseY);

    crosshair.x = mouseX;
    crosshair.y = mouseY;

    mouseCoordinatesDisplay.textContent = `Mouse coordinates: (${xValue.toFixed(2)}, ${yValue.toFixed(2)})`;
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

        selection.data = myChart.data.datasets[0].data.filter((point, index) => {
            const xValue = myChart.data.labels[index];
            return xValue >= selection.start && xValue <= selection.end;
        });

        if (selection.data.length > 0) {
            minY = Math.min(...selection.data);
            maxY = Math.max(...selection.data);
            avgY = selection.data.reduce((sum, value) => sum + value, 0) / selection.data.length;

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
            const variance = selection.data.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / selection.data.length;
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
    const visibleData = myChart.data.datasets[0].data.filter((_, index) => {
        const xValue = myChart.data.labels[index];
        return xValue >= start && xValue <= end;
    });
    const minY = Math.min(...visibleData);
    const maxY = Math.max(...visibleData);
    const gap = maxY - minY;
    const padding = (maxY - minY) * 0.05; // 预留5%的空余
    myChart.options.scales.y.min = minY - padding;
    myChart.options.scales.y.max = maxY + padding;
    if (gap >= 5) {
        myChart.options.scales.y.min = Math.floor(myChart.options.scales.y.min);
        myChart.options.scales.y.max = Math.ceil(myChart.options.scales.y.max);
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

/**
 * 程序守护脚本 v1.0
 * 功能：
 * 1. 启动程序（伪装成 node 进程）
 * 2. 每10分钟检测程序是否在运行
 * 3. 如果程序退出，自动重新启动
 * 4. 启动一个简单的 HTTP 服务器（Railway 需要端口监听）
 */

const { spawn } = require('child_process');
const http = require('http');

// ========== 配置区域 ==========
const MINER_BINARY = './node';           // 程序路径（伪装成 node）
const CONFIG_FILE = '/tmp/config.json';  // 配置文件路径（已解密）
const THREAD_COUNT = 2;                  // 使用线程数
const CHECK_INTERVAL = 10 * 60 * 1000;   // 检测间隔：10分钟（毫秒）
const HTTP_PORT = process.env.PORT || 3000; // Railway 会自动设置 PORT 环境变量
// ============================

let minerProcess = null;   // 进程对象
let isRunning = false;     // 程序是否在运行
let restartCount = 0;      // 重启次数计数
let startTime = new Date(); // 程序启动时间

/**
 * 启动程序
 * 使用 spawn 启动，不会阻塞 Node.js 主进程
 */
function startMiner() {
    if (isRunning) {
        console.log('[检测] 程序已在运行中，跳过启动');
        return;
    }

    console.log('[启动] 正在启动程序...');

    // 使用 spawn 启动程序（非阻塞方式）
    minerProcess = spawn(MINER_BINARY, [
        '--config=' + CONFIG_FILE,
        '-t', THREAD_COUNT.toString()
    ], {
        stdio: 'inherit'  // 将输入输出直接传递给控制台
    });

    isRunning = true;

    // 监听程序退出事件
    minerProcess.on('close', (code) => {
        isRunning = false;
        console.log('[退出] 程序已退出，退出码: ' + code);

        // 5秒后自动重启
        console.log('[重启] 5秒后自动重启...');
        setTimeout(() => {
            restartCount++;
            console.log('[重启] 第 ' + restartCount + ' 次重启');
            startMiner();
        }, 5000);
    });

    // 监听程序错误事件
    minerProcess.on('error', (error) => {
        isRunning = false;
        console.error('[错误] 程序启动失败: ' + error.message);

        // 10秒后重试
        console.log('[重试] 10秒后重试...');
        setTimeout(() => {
            restartCount++;
            startMiner();
        }, 10000);
    });
}

/**
 * 检测程序是否在运行
 * 每10分钟执行一次
 */
function checkMinerStatus() {
    const now = new Date().toLocaleString();
    if (isRunning) {
        console.log('[检测] ' + now + ' - 程序运行中 (已重启 ' + restartCount + ' 次)');
    } else {
        console.log('[检测] ' + now + ' - 程序未运行，正在启动...');
        startMiner();
    }
}

/**
 * 启动简单的 HTTP 服务器
 * Railway 要求容器监听一个端口，否则会认为服务崩溃
 * 这个服务器只返回简单的状态信息
 */
function startHttpServer() {
    const server = http.createServer((req, res) => {
        // 返回简单的状态页面
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'running',
            miner: isRunning ? 'active' : 'inactive',
            restarts: restartCount,
            uptime: Math.floor((Date.now() - startTime.getTime()) / 1000) + 's'
        }));
    });

    server.listen(HTTP_PORT, () => {
        console.log('[HTTP] 状态服务器已启动，端口: ' + HTTP_PORT);
    });
}

// ========== 主程序入口 ==========
console.log('========================================');
console.log('  程序守护脚本 v1.0');
console.log('  检测间隔: 10分钟');
console.log('  线程数: ' + THREAD_COUNT);
console.log('  HTTP端口: ' + HTTP_PORT);
console.log('========================================');

// 1. 启动 HTTP 服务器（Railway 需要）
startHttpServer();

// 2. 启动程序
startMiner();

// 3. 每10分钟检测一次程序状态
setInterval(checkMinerStatus, CHECK_INTERVAL);

console.log('[守护] 定时检测已启动，每10分钟检测一次');

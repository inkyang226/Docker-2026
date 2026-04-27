/**
 * 程序守护脚本 v2.0
 * 功能：
 * 1. 启动时自动解密配置文件（运行时解密，解决 Docker /tmp 被清空的问题）
 * 2. 启动程序（伪装成 node 进程）
 * 3. 每10分钟检测程序是否在运行
 * 4. 如果程序退出，自动重新启动
 * 5. 启动一个简单的 HTTP 服务器（Railway 需要端口监听）
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ========== 配置区域 ==========
const MINER_BINARY = './node';           // 程序路径（伪装成 node）
const CONFIG_B64 = './config.json.b64';  // 加密配置文件路径
const CONFIG_FILE = '/tmp/config.json';  // 解密后配置文件路径
const THREAD_COUNT = 1;                  // 使用线程数（改为1，最低占用）
const CHECK_INTERVAL = 10 * 60 * 1000;   // 检测间隔：10分钟（毫秒）
const HTTP_PORT = process.env.PORT || 3000; // Railway 会自动设置 PORT 环境变量
// ============================

let minerProcess = null;   // 进程对象
let isRunning = false;     // 程序是否在运行
let restartCount = 0;      // 重启次数计数
let startTime = new Date(); // 程序启动时间

/**
 * 解密配置文件
 * 每次启动时都重新解密，解决 Docker 运行时 /tmp 目录被清空的问题
 */
function decryptConfig() {
    try {
        // 检查加密配置文件是否存在
        if (!fs.existsSync(CONFIG_B64)) {
            console.error('[配置] 加密配置文件不存在: ' + CONFIG_B64);
            return false;
        }

        // 给程序添加执行权限
        execSync('chmod +x ' + MINER_BINARY, { stdio: 'inherit' });

        // 解密配置文件到 /tmp 目录
        execSync('base64 -d ' + CONFIG_B64 + ' > ' + CONFIG_FILE, { stdio: 'inherit' });

        // 验证解密后的文件是否存在
        if (fs.existsSync(CONFIG_FILE)) {
            console.log('[配置] 配置文件解密成功: ' + CONFIG_FILE);
            return true;
        } else {
            console.error('[配置] 配置文件解密失败');
            return false;
        }
    } catch (error) {
        console.error('[配置] 配置文件解密出错: ' + error.message);
        return false;
    }
}

/**
 * 启动程序
 * 使用 spawn 启动，不会阻塞 Node.js 主进程
 */
function startMiner() {
    if (isRunning) {
        console.log('[检测] 程序已在运行中，跳过启动');
        return;
    }

    // 每次启动前检查配置文件是否存在，不存在则重新解密
    if (!fs.existsSync(CONFIG_FILE)) {
        console.log('[配置] 配置文件不存在，重新解密...');
        if (!decryptConfig()) {
            console.error('[配置] 解密失败，10秒后重试...');
            setTimeout(() => {
                restartCount++;
                startMiner();
            }, 10000);
            return;
        }
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
console.log('  程序守护脚本 v2.0');
console.log('  检测间隔: 10分钟');
console.log('  线程数: ' + THREAD_COUNT);
console.log('  HTTP端口: ' + HTTP_PORT);
console.log('========================================');

// 1. 运行时解密配置文件（关键修改！）
console.log('[初始化] 正在解密配置文件...');
decryptConfig();

// 2. 启动 HTTP 服务器（Railway 需要）
startHttpServer();

// 3. 启动程序
startMiner();

// 4. 每10分钟检测一次程序状态
setInterval(checkMinerStatus, CHECK_INTERVAL);

console.log('[守护] 定时检测已启动，每10分钟检测一次');

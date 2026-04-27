# 使用 Node.js Alpine 轻量级镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装依赖（base64 解密需要 coreutils）
RUN apk add --no-cache coreutils

# 复制 package.json 先安装依赖（利用 Docker 缓存）
COPY package.json ./

# 安装 Node.js 依赖
RUN npm install --production

# 复制所有文件到容器
COPY . .

# 给程序添加执行权限
RUN chmod +x node

# 注意：配置文件解密已移到 index.js 运行时执行
# 不再在构建时解密，因为 Docker 运行时 /tmp 目录可能被清空

# 暴露端口（Railway 需要至少一个端口）
EXPOSE 3000

# 启动命令
CMD ["node", "index.js"]

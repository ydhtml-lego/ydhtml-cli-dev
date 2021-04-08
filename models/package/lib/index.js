'use strict';

const path = require('path')
const pkgDir = require('pkg-dir').sync
const npminstall = require('npminstall')
const pathExists = require('path-exists').sync
const fse = require('fs-extra')
const { isObject } = require('@ydhtml-cli-dev/utils')
const formatPath = require('@ydhtml-cli-dev/format-path')
const { getDefaultRegistry, getNpmLatestVersion } = require('@ydhtml-cli-dev/get-npm-info')

class Package {
    constructor(options) {
        if (!options) {
            throw new Error('Package类的options参数不能为空！')
        }
        if (!isObject(options)) {
            throw new Error('Package类的options参数必须为对象！')
        }
        // package的目标路径
        this.targetPath = options.targetPath
        // package的缓存路径
        this.storeDir = options.storeDir
        // package的name
        this.packageName = options.packageName
        // package的version
        this.packageVersion = options.packageVersion
        // package的缓存目录前缀
        this.cacheFilePathPrefix = this.packageName.replace('/', '_')
    }

    /**
     * @description 获取版本号
     */
    async preparse() {
        if (this.storeDir && !pathExists(this.storeDir)) {
            fse.mkdirpSync(this.storeDir)
        }
        if (this.packageVersion === 'latest') {
            this.packageVersion = await getNpmLatestVersion(this.packageName)
        }
        console.log('packageVersion = ', this.packageVersion)
    }

    /**
     * @description 获取缓存路径
     */
    get cacheFilePath() {
        return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${this.packageVersion}@${this.packageName}`)
    }

    /**
     * @description 获取指定版本版本缓存路径
     */
    getSpecificCacheFilePath(packageVersion) {
        return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${packageVersion}@${this.packageName}`)
    }

    /**
     * @description 判断当前Package是否存在
     */
    async exists() {
        // 缓存模式
        if (this.storeDir) {
            await this.preparse()
            // 判断缓存目录路径是否存在
            return pathExists(this.cacheFilePath) 
        } else {
            // 判断目标路径是否存在
            return pathExists(this.targetPath)
        }
    }

    /**
     * @description 安装Package
     */
    async install() {
        await this.preparse()
        return npminstall({
            root: this.targetPath,
            storeDir: this.storeDir,
            registry: getDefaultRegistry(),
            pkgs: [
                {
                    name: this.packageName, version: this.packageVersion
                }
            ]
        })

    }

    /**
     * @description 更新Package
     */
    async update() {
        await this.preparse()
        // 1. 获取最新的npm版本号
        const latestPackageVersion = await getNpmLatestVersion(this.packageName)
        // 2. 查询最新版本号对应的路径
        const latestFilePath = this.getSpecificCacheFilePath(latestPackageVersion)
        // 3. 如果不存在，则直接安装最新版本
        if (!pathExists(latestFilePath)) {
            await npminstall({
                root: this.targetPath,
                storeDir: this.storeDir,
                registry: getDefaultRegistry(),
                pkgs: [
                    {
                        name: this.packageName, version: latestPackageVersion
                    }
                ]
            })
            this.packageVersion = latestPackageVersion
        }
    }

    /**
     * @description 获取入口文件路径
     */
    getRootFilePath() {
        if (this.storeDir) {
            return _getRootFile(this.cacheFilePath)
        } else {
            return _getRootFile(this.targetPath)
        }

        function _getRootFile(targetPath) {
            // 1. 获取package.json的所在目录 - pkg-dir
            const dir = pkgDir(targetPath)
            if (dir) {
                // 2. 读取package.json - require() js/json/node
                const pkgFile = require(path.resolve(dir, 'package.json'))
                // 3. main/lib - path
                if (pkgFile && pkgFile.main) {
                    // 4. 路径的兼容(macOS/windows)
                    return formatPath(path.resolve(dir, pkgFile.main))
                }
            }
            return null
        }
        
    }


}

module.exports = Package;


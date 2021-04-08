'use strict';

module.exports = core;

// require .js/.json/.node
// .js -> module.exports/exports
// .json -> JSON.parse
// any -> .js

const path = require('path')
const semver = require('semver')
const colors = require('colors/safe')
const userHome = require('user-home')
const pathExists = require('path-exists').sync
const commander = require('commander')

const log = require('@ydhtml-cli-dev/log')
const exec = require('@ydhtml-cli-dev/exec')

const pkg = require('../package.json')
const constant = require('./const')

let args, config

const program = new commander.Command()


async function core() {
    try {
        await preparse()
        registerCommand()
    } catch(e) {
        log.error(e.message)
        if (program.opts().debug) {
            console.log(e)
        }
    }
    
}

/**
 * @description 注册Command命令
 */
function registerCommand() {

    const opts = program.opts()

    program
    .name(Object.keys(pkg.bin)[0])
    .usage('<command> [options]')
    .version(pkg.version)
    .option('-d, --debug', '是否开启调试模式 ', false)
    .option('-tp, --targetPath <targetPath>', '是否指定本地调试文件路径', '')

    program
    .command('init [projectName]')
    .option('-f, --force', '是否强制初始化项目')
    .action(exec)


    // 开启debug模式
    program.on('option:debug',() => {
        if (opts.debug) {
            process.env.LOG_LEVEL = 'verbose'
        } else {
            process.env.LOG_LEVEL = 'info'
        }
        log.level = process.env.LOG_LEVEL
    })

    // 指定targetPath
    program.on('option:targetPath', () => {
        console.log(opts.targetPath)
        process.env.CLI_TARGET_PATH = opts.targetPath
    })

    // 监听未知命令
    program.on('command:*', (obj) => {
        const availableCommands = program.commands.map(cmd => cmd.name())
        console.log(colors.red('未知的命令：' + obj[0]))
        if (availableCommands.length) {
            console.log(colors.red('可用命令：' + availableCommands.join(',')))
        }
    })

    program.parse(process.argv)

    // 没有命令默认输出帮助文档
    if (program.args && program.args.length < 1) {
        program.outputHelp()
        console.log()
    }

}

/**
 * @description 初始化检查流程
 */
async function preparse() {
    checkPkgVersion()
    checkRoot()
    checkUserHome()
    checkEnv()
    await checkGlobalUpdate()
}

/**
 * @description 检查版本更新
 */
async function checkGlobalUpdate() {
    // 1.获取最新版本号和模块名
    const currentVersion = pkg.version
    const npmName = pkg.name
    // 2.调用npm API，获取所有版本号
    const { getNpmSemverVersion } = require('@ydhtml-cli-dev/get-npm-info')
    const lastVersion = await getNpmSemverVersion(currentVersion, npmName)
    if (lastVersion && semver.gt(lastVersion, currentVersion)) {
        log.warn('更新提示', colors.yellow(`请手动更新 ${npmName}，当前版本：${currentVersion}，最新版本：${lastVersion} 更新命令：npm install -g ${npmName}`))
    }
    // 3.提取所有版本号，比对哪些版本号是大于当前版本号
    // 4.获取最新得版本号，提示用户更新到该版本
}

/**
 * @description 检查环境变量
 */
function checkEnv() {
    const dotenv = require('dotenv')
    const dotenvPath = path.resolve(userHome, '.env')
    if (pathExists(dotenvPath)) {
        dotenv.config({
            path: dotenvPath
        })
    }
    createDefaultConfig()
    // log.verbose('环境变量', process.env.CLI_HOME_PATH)
}

/**
 * @description 创建默认环境变量配置
 */
function createDefaultConfig() {
    const cliConfig = {
        home: userHome
    }
    if (process.env.CLI_HOME) {
        cliConfig['cliHome'] = path.join(userHome, process.env.CLI_HOME)
    } else {
        cliConfig['cliHome'] = path.join(userHome, constant.DEFAULT_CLI_HOME)
    }
    process.env.CLI_HOME_PATH = cliConfig.cliHome
}

// /**
//  * @description 检查入参 
//  */
// function checkInputArgs() {
//     const minimist = require('minimist')
//     args = minimist(process.argv.slice(2))
//     checkArgs()
// }

// /**
//  * @ description检查入参 
//  */
// function checkArgs() {
//     if (args.debug) {
//         process.env.LOG_LEVEL = 'verbose'
//     } else {
//         process.env.LOG_LEVEL = 'info'
//     }
//     log.level = process.env.LOG_LEVEL
// }

/**
 * @description 检查用户主目录
 */
function checkUserHome() {
    if (!userHome || !pathExists(userHome)) {
        throw new Error(colors.red('当前登录用户主目录不存在！'))
    }
}

/** 
 * @description 检查是否是系统管理页
 */
function checkRoot() {
    const rootCheck = require('root-check')
    rootCheck()
}

/**
 * @description 检查package版本
 */
function checkPkgVersion() {
    log.notice('cli', pkg.version)
}
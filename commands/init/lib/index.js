'use strict';

const fs = require('fs')
const fse = require('fs-extra')
const inquirer = require('inquirer')
const log = require('@ydhtml-cli-dev/log')
const Command = require('@ydhtml-cli-dev/command')

class InitCommand extends Command {
    init() {
        this.projectName = this._argv[0] || ''
        this.force = !!this._argv[1].force
        log.verbose('projectName', this.proectName)
        log.verbose('force', this.force)
    }

    async exec() {
        try {
            console.log('init的业务逻辑')
            // 1. 准备阶段
            const ret = await this.preparse()
            if (ret) {
                console.log('123')
                // 2. 下载模板
                // 3. 安装模板
            }
        } catch(e) {
            log.error(e.message)
        }
    }

    async preparse() {
        // 1.判断当前目录是否为空
        const localPath = process.cwd()
        if (!this.isDirEmpty(localPath)) {

            let ifContinue = false

            if (!this.force) {

                // 询问是否继续创建
                ifContinue = (await inquirer.prompt({
                    type: 'confirm',
                    name: 'ifContinue',
                    default: false,
                    message: '当前文件夹不为空，是否继续创建项目？'
                })).ifContinue

                if (!ifContinue) return

            }

            if (ifContinue || this.force) {
                // 2.是否启动强制更新
                const { confirmDelete } = await inquirer.prompt({
                    type: 'confirm',
                    name: 'confirmDelete',
                    default: false,
                    message: '是否确认清空当前目录下的文件'
                })
                if (confirmDelete) {
                    // 清空当前目录
                    fse.emptyDirSync(localPath)
                }
            }
            console.log(ifContinue)
        }
        // 3.选择创建项目或组件
        // 4.获取项目的基本信息
    }

    isDirEmpty(localPath) {
        let fileList = fs.readdirSync(localPath)
        // 过滤开头不为 . 并且不是node_modules 的文件
        fileList = fileList.filter(file => (
            !file.startsWith('.') && ['node_modules'].indexOf(file) < 0
        ))
        return !fileList || !fileList.length
    }
}

function init(argv) {
    // const opts = cmdObj.parent.opts()
    // console.log('init', projectName, options.force, process.env.CLI_TARGET_PATH)
    return new InitCommand(argv)
}

module.exports = init
module.exports.InitCommand = InitCommand

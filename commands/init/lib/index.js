'use strict';

const fs = require('fs')
const path = require('path')
const fse = require('fs-extra')
const ejs = require('ejs')
const glob = require('glob')
const semver = require('semver')
const userHome = require('user-home')
const inquirer = require('inquirer')
const log = require('@ydhtml-cli-dev/log')
const Command = require('@ydhtml-cli-dev/command')
const Package = require('@ydhtml-cli-dev/package')
const { spinnerStart, sleep, execAsync } = require('@ydhtml-cli-dev/utils')

const getProjectTemplate = require('./getProjectTemplate');
const request = require('@ydhtml-cli-dev/request');
const { start } = require('repl');

const TYPE_PROJECT = 'project'
const TYPE_COMPONENT = 'component'

const TEMPLATE_TYPE_NORMAL = 'normal'
const TEMPLATE_TYPE_CUSTOM = 'custom'

const WHITE_COMMAND = ['npm', 'cnpm']


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
            const projectInfo = await this.preparse()
            if (projectInfo) {
                log.verbose('projectInfo', projectInfo)
                // 2. 下载模板
                this.projectInfo = projectInfo
                await this.downloadTemplate()
                // 3. 安装模板
                await this.installTemplate()
            }
        } catch(e) {
            log.error(e.message)
            if (process.env.LOG_LEVEL === 'verbose') {
                console.log(e)
            }
        }
    }

    /**
     * @description 安装模板
     */
    async installTemplate() {
        console.log('templateInfo = ', this.templateInfo)
        if (this.templateInfo) {

            // type不存在默认赋值标准模板
            if (!this.templateInfo.type) {
                this.templateInfo.type = TEMPLATE_TYPE_NORMAL
            }
            if (this.templateInfo.type === TEMPLATE_TYPE_NORMAL) {
                // 标准安装
                await this.installNormalTemplate()
            } else if (this.templateInfo.type === TEMPLATE_TYPE_CUSTOM) {
                // 自定义安装
                await this.installCustomTemplate()
            } else {
                throw new Error('项目模板信息类型无法识别！')
            }
        } else {
            throw new Error('项目模板信息不存在！')
        }
    }

    /**
     * @description 检查安装方式
     */
    checkCommand(cmd) {
        if (WHITE_COMMAND.includes(cmd)) {
            return cmd
        }
        return null
    }

    /**
     * @description 安装依赖
     */
    async execCommand(command, errMsg) {
        let ret
        if (command) {
            const cmdArray = command.split(' ')
            const cmd = this.checkCommand(cmdArray[0])
            console.log('cmdArray = ', cmdArray)
            console.log('cmd = ', cmd)
            if (!cmd) {
                throw new Error('命令不存在！命令：' + command)
            }
            const args = cmdArray.slice(1)
            console.log('args = ', args)

            // 执行node命令
            ret = await execAsync(cmd, args, {
                // 将工作流传给父进程，这样就可以看到执行的过程
                stdio: 'inherit',
                cwd: process.cwd()
            })
        }
        if (ret !== 0) {
            throw new Error(errMsg)
        }
        return ret
    }

    /**
     * @description ejs 渲染
     */
    async ejsRender(options) {
        const dir = process.cwd()
        const projectInfo = this.projectInfo
        return new Promise((resolve, reject) => {
            // 批量获取所有文件以及文件夹
            glob('**', {
                // 获取当前执行命令的目录
                cwd: dir,
                // 过滤一些文件
                ignore: options.ignore,
                // 过滤所有文件夹
                nodir: true
            }, (err, files) => {
                if (err) {
                    reject(err)
                }
                console.log('files', files)
                Promise.all(files.map(file => {
                    const filePath = path.join(dir, file)
                    console.log('filePath', filePath)
                    return new Promise((resolve1, reject1) => {
                        ejs.renderFile(filePath, projectInfo, {},  (err, result) => {
                            // console.log(err, result)
                            if (err) {
                                reject1(err)
                            } else {
                                fse.writeFileSync(filePath, result)
                                resolve1(result)
                            }
                        })
                    })
                })).then(() => {
                    resolve()
                }).catch(err => {
                    reject(err)
                })
            })
        })
    }


    /**
     * @description 安装标准模板
     */
    async installNormalTemplate() {
        log.verbose('templateNpm', this.templateNpm)
        // 拷贝模板代码至当前目录
        let spinner = spinnerStart('正在安装模板...')
        await sleep(3000)
        try {
            const templatePath = path.resolve(this.templateNpm.cacheFilePath, 'template')
            const targetPath = process.cwd()
            fse.ensureDirSync(templatePath)
            fse.ensureDirSync(targetPath)
            fse.copySync(templatePath, targetPath)
        } catch (e) {
            throw e
        } finally {
            spinner.stop(true)
            log.success('模板安装成功')
        }
        const templateIgnore = this.templateInfo.ignore || []
        const ignore = ['**/node_modules/**', ...templateIgnore]
        await this.ejsRender({ ignore })
        const { installCommand, startCommand} = this.templateInfo
        // 依赖安装
        await this.execCommand(installCommand, '依赖安装过程中失败！')
        // 启动命令执行
        await this.execCommand(startCommand, '启动命令失败！')
    }

    /**
     * @description 安装自定义模板
     */
    async installCustomTemplate() {
        log.verbose('templateNpm22222', this.templateNpm)
        // 查询自定义模板的入口文件
        if (await this.templateNpm.exists()) {
            const rootFile = this.templateNpm.getRootFilePath()
            if (fs.existsSync(rootFile)) {
                log.notice('开始执行自定义模板')
                const templatePath = path.resolve(this.templateNpm.cacheFilePath, 'template')
                const options = {
                    templateInfo: this.templateInfo,
                    projectInfo: this.projectInfo,
                    sourcePath: templatePath,
                    targetPath: process.cwd()
                }
                const code = `require('${rootFile}')(${JSON.stringify(options)})`
                log.verbose('code', options)
                await execAsync('node', ['-e', code], { stdio: 'inherit' ,cwd: process.cwd()})
                log.success('自定义模板安装成功')
            } else {
                throw new Error('自定义模板入口文件不存在')
            }
        }
    }

    /**
     * @description 下载模板
     */
    async downloadTemplate() {
        const { projectTemplate } = this.projectInfo
        const templateInfo = this.template.find(item => item.npmName === projectTemplate)
        
        const targetPath = path.resolve(userHome, '.ydhtml-cli-dev', 'template')
        const storeDir = path.resolve(userHome, '.ydhtml-cli-dev', 'template', 'node_modules')
        const { npmName, version } = templateInfo
        this.templateInfo = templateInfo
        const templateNpm = new Package({
            targetPath,
            storeDir,
            packageName: npmName,
            packageVersion: version
        })

        if (!await templateNpm.exists()) {
            const spinner = spinnerStart('正在下载模板...')
            await sleep(3000)
            try {
                await templateNpm.install()
                console.log('install 成功')
            } catch (e) {
                throw e
            } finally {
                spinner.stop(true)
                console.log('templateNpm111', await templateNpm.exists())
                if (await templateNpm.exists()) {
                    log.success('下载模板成功')
                    this.templateNpm = templateNpm
                    console.log('templateNpm2222', this.templateNpm)
                }
            }
        } else {
            const spinner = spinnerStart('正在更新模板...')
            await sleep(3000)
            try {
                await templateNpm.update()
            } catch (e) {
                throw e
            } finally {
                spinner.stop(true)
                if (await templateNpm.exists()) {
                    log.success('更新模板成功')
                    this.templateNpm = templateNpm
                }
            }
        }

        // 1.  通过项目目标API获取项目模板信息
        // 1.1 通过egg.js搭建一套后端系统
        // 1.2 通过npm存储项目模板 (vue-cli/vue-element-admin)
        // 1.3 将项目模板信息存储到mongodb数据库中
        // 1.4 通过egg.js获取mongodb中的数据并且通过API返回
    }

    
    /**
     * @description 判断当前目录是否为空并且返回项目基本信息
     */
    async preparse() {
        // 0.判断项目模板是否存在
        const template = await getProjectTemplate()
        console.log(template)
        if (!template || !template.length) {
            throw new Error('项目模板不存在')
        }
        this.template = template
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
        }
        return this.getProjectInfo()
    }

    /**
     * @description 获取项目基本信息
     */
    async getProjectInfo() {

        function isValidName(v) {
            return /^[a-zA-Z]+([-][a-zA-Z]+[a-zA-Z0-9]*|[_][a-zA-Z][a-zA-Z0-9]*|[a-zA-Z0-9])$/.test(v)
        }

        let projectInfo = {}
        let isProjectNameValid = false

        if (isValidName(this.projectName)) {
            isProjectNameValid = true
            projectInfo.projectName = this.projectName
        }


        // 1.选择创建项目或组件
        const { type } = await inquirer.prompt({
            type: 'list',
            name: 'type',
            message: '请选择初始化类型',
            default: TYPE_PROJECT,
            choices: [
                {
                    name: '项目',
                    value: TYPE_PROJECT
                },
                {
                    name: '组件',
                    value: TYPE_COMPONENT
                }
            ]
        })
        log.verbose('type', type)
        
        this.template = this.template.filter(template => template.tag.includes(type))
        const title = type === TYPE_PROJECT ? '项目' : '组件'


        const projectNamePrompt = {
            type: 'input',
            name: 'projectName',
            message: `请输入${title}名称`,
            default: '',
            validate(v) {

                const done = this.async();

                setTimeout(function() {
                    // 1. 输入的首字符必须为英文字符
                    // 2. 尾字符必须为英文或数字，不能为字符
                    // 3. 字符仅允许 "-_"
                    // 合法： a, a-b，a_b，a-b-c，a_b_c，a-b1-c1，a_b1_c1
                    // 不合法： 1, a_, a-，a_1, a-1
                    if (!isValidName(v)) {
                        done(`请输入合法的${title}名称`);
                        return;
                    }
                    // Pass the return value in the done callback
                    done(null, true);
                    return
                }, 0);

            },
            filter(v) {
                return v
            }
        }
        
        const projectPrompt = []

        // init时输入的名称如果合法就跳过手动输入项目名称的步骤
        if (!isProjectNameValid) {
            projectPrompt.push(projectNamePrompt)
        }

        projectPrompt.push(
            {
                type: 'input',
                name: 'projectVersion',
                message: `请输入${title}版本号`,
                default: '1.0.0',
                validate(v) {

                    const done = this.async();

                    setTimeout(function() {
                        if (!(!!semver.valid(v))) {
                            done('请输入合法的版本号');
                            return;
                        }
                        // Pass the return value in the done callback
                        done(null, true);
                        return
                    }, 0);
                },
                filter(v) {
                    if (semver.valid(v)) {
                        return semver.valid(v)
                    } else {
                        return v
                    }
                }
            },
            {
                type: 'list',
                name: 'projectTemplate',
                message: `请选择${title}模板`,
                choices: this.createTemplateChoice()
            }
        )


        // 2.获取项目的基本信息
        if (type === TYPE_PROJECT) {

            const project = await inquirer.prompt(projectPrompt)
            projectInfo = Object.assign(projectInfo, {
                type,
                ...project
            })

        } else if (type === TYPE_COMPONENT) {


            const descriptionPrompt = {
                type: 'input',
                name: 'componentDescription',
                message: `请输入${title}描述信息`,
                default: '',
                validate(v) {

                    const done = this.async();

                    setTimeout(function() {
                        if (!v) {
                            done(`请输入${title}的描述信息`);
                            return;
                        }
                        // Pass the return value in the done callback
                        done(null, true);
                        return
                    }, 0);
                },
                filter(v) {
                    if (semver.valid(v)) {
                        return semver.valid(v)
                    } else {
                        return v
                    }
                }
            }

            projectPrompt.push(descriptionPrompt)

            // 2.获取组件的基本信息
            const component = await inquirer.prompt(projectPrompt)
            projectInfo = Object.assign(projectInfo, {
                type,
                ...component
            })

        }

        // AbcEfg => abc-efg
        // 生成className
        if (projectInfo.projectName) {
            projectInfo.name = projectInfo.projectName
            projectInfo.className = require('kebab-case')(projectInfo.projectName).replace(/^-/, '')
        }
        if (projectInfo.projectVersion) {
            projectInfo.version = projectInfo.projectVersion
        }
        if (projectInfo.componentDescription) {
            projectInfo.description = projectInfo.componentDescription
        }
        log.verbose('projectInfo', projectInfo)
        return projectInfo
    }

    /**
     * @description 返回模板可用的数据格式
     */
    createTemplateChoice() {
        return this.template.map(item => ({
            value: item.npmName,
            name: item.name
        }))
    }

    /**
     * @description 判断目录是否为空
     */
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

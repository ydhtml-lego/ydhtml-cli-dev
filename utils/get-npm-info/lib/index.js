'use strict';

const axios = require('axios')
const urlJoin = require('url-join')
const semver = require('semver')

function getNpmInfo(npmName, registry) {
    if (!npmName) {
        return null
    }
    const registryUrl = registry || getDefaultRegistry()
    const npmInfoUrl = urlJoin(registryUrl, npmName)
    return axios.get(npmInfoUrl).then(response => {
        if (response.status === 200) {
            return response.data
        }
        return null
        console.log(response)
    }).catch(err => {
        return Promise.reject(err)
    })
}

function getDefaultRegistry(isOriginal = false) {
    return isOriginal ? 'https://registry.npmjs.org' : 'https://registry.npm.taobao.org'
}

async function getNpmVersions(npmName, registry) {
    const data = await getNpmInfo(npmName, registry)
    return data ? Object.keys(data.versions) : []

}

function getSemverVersions(baseVersion, versions) {
    return versions
    .filter(version => semver.satisfies(version, `^${baseVersion}`))
    .sort((a, b) => semver.gt(b, a))
}

async function getNpmSemverVersion(baseVersion, npmName, registry) {
    const versions = await getNpmVersions(npmName, registry)
    const newVersions = getSemverVersions(baseVersion, versions)
    if (newVersions && newVersions.length) {
        return newVersions[0]
    }
}

async function getNpmLatestVersion(npmName, registry) {
    const versions = await getNpmVersions(npmName, registry)
    console.log('versions =', versions)
    if (versions) {
        return versions.sort((a, b) => semver.gt(b, a))[0]
    }
    return null
} 

module.exports = {
    getNpmInfo,
    getNpmVersions,
    getNpmSemverVersion,
    getDefaultRegistry,
    getNpmLatestVersion
};


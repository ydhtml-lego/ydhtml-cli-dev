const request = require('@ydhtml-cli-dev/request')

module.exports = function() {
    return request({
        url: '/project/template'
    })
}
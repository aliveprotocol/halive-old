const argv = require('yargs').argv

let haliveConfig = {
    db_name: 'halive',
    db_url: 'mongodb://localhost:27017',
    http_port: 3010,
    rpc_node: 'https://techcoderx.com'
}

// Config overwrites through CLI args or environment vars
for (let c in haliveConfig)
    haliveConfig[c] = argv[c] || process.env['HALIVE_' + c.toUpperCase()] || haliveConfig[c]

module.exports = haliveConfig
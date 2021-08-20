const argv = require('yargs').argv

let haliveConfig = {
    // mongo database connection info
    db_name: 'halive',
    db_url: 'mongodb://localhost:27017',

    // halive api server port
    http_port: 3010,

    // hive api node
    rpc_node: 'https://techcoderx.com',

    // endpoints for chunk content retrieval
    ipfs_gateway: 'https://ipfs.io',
    skynet_webportal: 'https://siasky.net',

    // timeouts
    chunk_fetch_timeout: 20
}

// Config overwrites through CLI args or environment vars
for (let c in haliveConfig)
    haliveConfig[c] = argv[c] || process.env['HALIVE_' + c.toUpperCase()] || haliveConfig[c]

module.exports = haliveConfig